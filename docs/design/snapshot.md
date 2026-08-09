# Snapshot Design

Status: draft — M1, revised after fresh-context review
Parent: [architecture.md](architecture.md) §5.3 (also §3 principles 1 and 5).

## Goal

One read model for the whole bot: every tick, game state becomes plain data once, and all
decision logic consumes that data. Success criteria:

- **No `room.find` anywhere else.** Direct `Game` access outside this module is limited
  to a documented exception list: the shell's bootstrap steps (owned-room listing and
  creep-memory GC, before the snapshot exists — plain object iteration, no `find`);
  movement (PathFinder, `Game.creeps[name]` live position/fatigue, `creep.move`
  intents); and the intent adapters that *execute* decisions via `handles.resolve` —
  creep execution's runner and the spawn adapter's `spawnCreep` (later: towers).
  Everything that *decides* consumes views.
- Pure cores receive finished plain objects — nothing they touch can trigger a `Game`
  read, and everything they receive is JSON-serializable (unit tests enforce this).
- Eager snapshot cost is metered under `SubsystemId.Snapshot`. On-demand `room(name)`
  builds (M5+, remotes/scouting) execute inside the requesting entry and **bill to the
  caller's meter** — the attribution rule is stated here so nobody reads per-entry CPU
  wrong later.

## Interface

View types are cross-subsystem contracts and live in `src/shared/views.ts`. The builder
is `src/snapshot/index.ts`:

```ts
export function buildSnapshot(): WorldSnapshot;   // called by shell, once per tick
```

M1 view surface (fields grow with consumers; shapes don't change; **optional fields are
omitted when absent, never set to `undefined`** — this keeps views exactly
JSON-round-trippable):

```ts
export interface Pos { x: number; y: number; roomName: string }

/** Resource-typed from day one — architecture §7 seam 1. */
export interface StoreView {
    free: number;
    used: number;
    byResource: Partial<Record<ResourceConstant, number>>;
}

export interface CreepView {
    name: string;
    id: Id<Creep>;
    pos: Pos;
    hits: number; hitsMax: number;
    ticksToLive?: number;              // omitted while spawning
    spawning: boolean;
    /** Counts of ALL parts, damaged or not. Active-part counts are a consumer
     *  computation (defense, M4) — most consumers (spawn diffing, body sizing) want totals. */
    bodyCounts: Partial<Record<BodyPartConstant, number>>;
    store: StoreView;
    memory: Readonly<CreepMemory>;     // live reference, read-only by convention (§6 ownership rules)
}

export interface StructureView {
    id: Id<AnyStructure>;
    type: StructureConstant;
    pos: Pos;
    hits: number; hitsMax: number;
    store?: StoreView;                 // present iff the structure has a store
}
export type StructuresByType = Partial<Record<StructureConstant, StructureView[]>>;
// Per-type extensions (e.g. a spawn's spawning progress) are added as their consumers
// land (M2+), as new optional fields on StructureView — the container shape never changes.

export interface RoomSnapshot {
    name: string;
    my: boolean;
    controller?: {
        level: number; my: boolean; progress: number; progressTotal: number;
        ticksToDowngrade: number; safeMode?: number; safeModeAvailable: number;
        upgradeBlocked?: number;
    };
    energyAvailable: number;
    energyCapacityAvailable: number;
    sources: { id: Id<Source>; pos: Pos; energy: number; energyCapacity: number }[];
    mineral?: { id: Id<Mineral>; pos: Pos; type: MineralConstant; amount: number };
    structures: StructuresByType;
    myConstructionSites: { id: Id<ConstructionSite>; pos: Pos; type: StructureConstant;
                           progress: number; progressTotal: number }[];
    hostiles: { id: Id<Creep>; pos: Pos; owner: string; hits: number;
                bodyCounts: Partial<Record<BodyPartConstant, number>> }[];
    dropped: { id: Id<Resource>; pos: Pos; resource: ResourceConstant; amount: number }[];
}

export interface WorldSnapshot {
    time: number;
    myRooms: RoomSnapshot[];                    // built eagerly — always needed
    room(name: string): RoomSnapshot | undefined; // other visible rooms, built on demand
    myCreeps: CreepView[];
}
```

**On-demand materialization** (architecture §5.3): `room(name)` builds and caches a view
on first request. Only adapter-layer code may call it — by the time a pure core runs, its
caller has materialized everything the core receives. Cores take `RoomSnapshot`/view
values as parameters; they never hold the `WorldSnapshot` itself. This is the enforcement
mechanism for "materialized before any pure core runs."

Two deliberately separate adapter-side helpers (not part of the pure surface):

- `src/snapshot/handles.ts`: `resolve<T>(id: Id<T>): T | null` — wraps
  `Game.getObjectById` for intent execution. Only adapters (creep execution's intent
  runner, the spawn adapter, later towers) import it; cores emit ids, never objects.
- `src/snapshot/terrain.ts`: `getTerrain(roomName): TerrainGrid` where `TerrainGrid` is
  a plain `{ isWall(x, y): boolean; isSwamp(x, y): boolean }` over a copied
  `Uint8Array(2500)` of terrain masks. Terrain is immutable, so the grid is heap-cached
  forever (rebuilt lazily after a global reset). Consumers: movement and economy's spot
  chooser (M2), layout (M3).

**M2 view extensions** (consumers landed, fields added per the "fields grow, shapes
don't" rule): `ControllerView` gains `id` and `pos` (the upgrade executor and economy's
upgrade-spot chooser need them); `StructureView` gains optional `spawning?: boolean`,
present on spawn structures (the spawn resolver's free/busy input).

## Memory Schema

None. The snapshot is per-tick heap state, keyed by `Game.time`; a global reset costs one
rebuild, which happens every tick anyway (architecture principle 7). Terrain cache is
heap-only optimization.

## Tick Flow

Built by the shell when constructing `TickContext`, metered under `SubsystemId.Snapshot`:

1. `myCreeps`: one pass over `Game.creeps`.
2. `myRooms`: for each owned room, one pass — `FIND_SOURCES`, `FIND_MINERALS`,
   `FIND_STRUCTURES` (bucketed by type in one pass), `FIND_MY_CONSTRUCTION_SITES`,
   `FIND_HOSTILE_CREEPS`, `FIND_DROPPED_RESOURCES` — each called exactly once.
3. Non-owned visible rooms: nothing until `room(name)` is called (remotes/scouting will,
   from M5; billed to the caller per the Goal section).

Within a tick, repeated access returns the same objects (identity-stable — consumers may
use reference equality). A stale handle across ticks is a bug: `room()` and `myRooms`
access assert `snapshot.time === Game.time` **always** (one comparison — there is no
dev/prod build split in this toolchain, and a loud throw in sim is exactly what we want).

## Edge Cases

- **Controller-less rooms** (highway/center): `controller` omitted; consumers must not
  assume its presence (enforced by the type).
- **Spawning creeps** appear in `myCreeps` with `spawning: true` and `ticksToLive`
  omitted. They count as alive for planners' demand diffing (spawn.md, M2) — excluding
  them would cause double-spawning.
- **My creeps in other rooms** (remotes, scouts) are in `myCreeps` regardless of room;
  `pos.roomName` says where they are.
- **`memory` is a live reference**, not a copy (copying every creep memory every tick is
  pure waste). Read-only-ness is by convention + ownership rules (architecture §6); it is
  also the one documented exception to the JSON-round-trip purity rule.
- **Restricted stores** (spawn/extension/tower — energy-only): the argless
  `getFreeCapacity()`/`getUsedCapacity()` return `null` for them; the builder's
  energy-keyed fallback is load-bearing (this exact gotcha silently zeroed every spawn's
  free capacity and starved M2's haul loop before sim caught it).
- **Hostiles include harmless creeps** (scouts with no attack parts). Classification is
  defense's job (M4); the snapshot reports, never judges.
- **Lost visibility between ticks**: `room(name)` returns `undefined` next tick —
  consumers that need memory of unseen rooms use intel (M5), not the snapshot.

## Test Plan

Unit (mocha, mocked `Game` from `test/helpers/mock.ts` — the Room/structure mock
factories don't exist yet and are part of this milestone's work):

- Shape tests: a mocked room with one of everything produces the expected view values
  (positions, stores by resource, controller fields, bucketing by structure type,
  mineral).
- Find discipline: spies assert each find constant is called at most once per room per
  tick, and zero times for rooms never requested.
- Identity + staleness: same object within a tick; time-mismatch assertion throws across
  ticks.
- Purity: every view JSON-round-trips exactly (`deepEqual(JSON.parse(JSON.stringify(v)), v)`)
  — made exact by the omit-don't-undefined rule — with `memory` stripped first as the
  documented exception.
- Terrain: grid matches mocked terrain masks; second call returns the cached grid.

Sim: M1 smoke (shell.md) proves real-engine cost: telemetry shows the `snapshot` entry's
cpu within budget on the `default` scenario.
