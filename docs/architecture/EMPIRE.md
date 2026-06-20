# Empire Layer (cross-room broker)

The single-room economy (per-room flow model + capability-matched jobs) is the
workhorse and stays unchanged. The **empire layer** sits one level above it and
resolves the small set of decisions a single room *cannot* make on its own. Its
first and currently only job is **remote mining**.

For the per-room economy this builds on, see
[ENERGY_FLOW_SPAWNING](ENERGY_FLOW_SPAWNING.md) and
[MODULAR_ARCHITECTURE](MODULAR_ARCHITECTURE.md).

## The unifying frame

Every form of inter-room help is the same thing: a **cross-room flow of one
currency, from a room with surplus to a room with deficit, gated by distance.**

| Currency | "Help" looks like | Path |
|---|---|---|
| **Energy** | remote mining, bootstrap injection, growth acceleration | economy job (cross-room haul) |
| **Labor** | pioneers to a new room, builders to accelerate | economy job |
| **Military** | defenders to a threatened room | controller / `SpawnRequest` |

Remote mining is the **energy** case where the surplus source sits in an
*unowned* room. The empire layer is therefore a resource broker, not a
remote-mining subsystem; remote mining is just the first currency wired through
it. Bootstrap-help, defense-help, and growth-acceleration are later currencies
through the same broker (see [Future](#future)) — they are additive, not new
architecture.

## What is genuinely global

Under **whole-room ownership** (a remote is owned by exactly one home room) the
only decision no single room can make is **allocation** — which home room owns
which remote, a function of every room's storage position. Everything else stays
local to the owner:

- **Reservation** of a remote is the owner's concern (one room funds, one room
  benefits — costs and benefits aligned).
- **Defense** of a remote is the owner's concern (its creeps are the ones at
  risk).

Reservation/defense only *become* global if remotes are **shared** across rooms
(per-source splitting — see [Future](#future)). We do not do that in v1. So the
empire layer is thin: it owns allocation + a small per-remote policy, and the
per-room economy executes against it.

## Two key design choices

1. **No new `JobKind`.** A remote harvest *is* `Harvest` (a source in a non-owned
   room); a remote haul *is* `Haul` (cross-room). We extend *where* the existing
   kinds are generated and make haul cross-room. We do not touch the
   three-registry core for the bulk of the work.
2. **Economy-driven, not a controller subsystem.** Remote miners and haulers are
   ordinary economy creeps — capability-matched, logistics-routed,
   ledger-coordinated like every other creep. The empire layer only decides
   *which* remotes and *how much*; the per-room flow model still sizes the
   workforce and self-limits (a too-far remote is never funded). The only
   imperative residue is the **reserver** and (later) the **defender**, which
   ride the existing `SpawnRequest` + `commandControllerCreeps` seam.

## Data model

### Enriched intel (`src/intel/types.ts`)

Scouting must record enough to *select and mine* a remote without standing in it
every tick. `RoomIntel` carries source ids+positions, the controller id +
reservation, owner, and threat flags:

```ts
interface SourceIntel { id: string; x: number; y: number; }

interface RoomIntel {
    lastSeen: number;
    sources: SourceIntel[];
    controllerId?: string;
    controllerLevel?: number;
    owner?: string;                                  // controller owner username
    reservation?: { username: string; ticks: number };
    hostiles: number;
    invaderCore?: boolean;
    sourceKeeper?: boolean;
}
```

`sources` changing from `number` to `SourceIntel[]` is a data-type change →
migration wipes stale `intel` once (it regenerates within a scout interval). See
[MEMORY_MIGRATIONS](../qa/MEMORY_MIGRATIONS.md).

### Empire memory (`src/empire/types.ts`)

```ts
interface RemotePlan {
    roomName: string;   // the remote room
    owner: string;      // owning home room
    sources: string[];  // source ids in the remote
    distance: number;   // tiles, owner storage → remote (cached; sizes haulers)
    active: boolean;    // false = paused (threat) — stops job gen + funding
    reserve: boolean;   // whether to hold the controller reserved
}

interface EmpireMemory {
    remotes: Record<string, RemotePlan>;  // keyed by remote roomName
    lastPlanned?: number;
}
```

This replaces the unused `Memory.empire?: unknown` placeholder.

### `targetRoom` (the home-vs-working-for split)

A remote creep is spawned in its home room but operates in a remote. Both
`CreepMemory` and `SpawnRequest` gain an optional `targetRoom`:

- `CreepMemory.home` — the room that spawned it and counts it in population.
- `CreepMemory.targetRoom` — the room it works in (set only for remote creeps).

Additive optional; no data migration. Every future cross-room helper reuses this
field.

## How it hangs together

### Matcher scope (the pin that prevents poaching)

Empty creeps re-decide their job each cycle, so without a guard a remote hauler
would be yanked onto a closer home job the moment it empties. The fix is a small
**scope gate** in matching:

> a creep may take a job only if `job.roomName === creep.memory.home` **or**
> `job.roomName === creep.memory.targetRoom`.

This cleanly partitions the workforce: home creeps (no `targetRoom`) do home jobs
only; remote creeps are pinned to their remote's jobs. Capability, need, the
ledger, and stickiness are all unchanged underneath.

### Spawn ordering (where "how much" comes from)

The per-room flow model is extended with a **remote tier** between home
infrastructure and the elastic consumer:

```
floor → home infra (miner/hauler) → remote infra (miner/hauler, targetRoom set) → consumer (upgrade)
```

A room extends to a remote only once its own income+logistics are staffed —
remotes soak surplus spawn capacity exactly like upgraders do, but ahead of them
(growing income beats burning it). This makes "how much remote mining" an
**output**: a healthy room reaches out; a struggling one doesn't; a too-far
remote needs so many haulers it never wins a spawn slot. Self-limiting, no knob.

Home labor accounting excludes `targetRoom` creeps so a remote miner's WORK is
never miscounted as home income; each remote is sized separately from its own
`sources` and cached `distance`.

### Travel-to-vision

Remote jobs reference rooms the bot usually can't see. `runCreep` moves a creep
toward its job's room (via `moveToRoom`) when that room isn't visible, instead of
no-op'ing; once it arrives the room is in `world` and normal execution resumes.
Harvest jobs are generated from **intel** (with `pos` set) so they exist before
vision. Executors receive `world` (not just one `WorldRoom`) so cross-room haul
can gather in the remote and deliver at home.

### Reservation & defense (the imperative residue)

- **Reserve.** When `remote.reserve` and the controller's reservation is low, the
  empire emits a `Claimer` `SpawnRequest` (`owner: "remote-reserve:<room>"`,
  `targetRoom` set). `commandControllerCreeps` drives it to `reserveController`.
  Reserving holds the source at 10 e/tick (vs 5 unreserved). Invader-core rooms
  are not reserved.
- **Defense / abandon (v1 = abandon-only).** When intel shows hostiles or an
  invader core, `planEmpire` flips the remote to `active: false`: job generation
  and remote demand stop, and the remote's creeps have their `targetRoom` cleared
  so they **fold back into the home economy**. When the room reads clear, it
  reactivates. Defender dispatch is a later enhancement.

## Pipeline placement (`src/main.ts`)

```
4.   Scouting (enriched intel; throttled)        updateIntel(world)
4.5  Empire planning (throttled)                 planEmpire(world)  → Memory.empire + scout/reserve SpawnRequests
5.   Strategy (per room) + remote job generation generateJobs(world, board)  (now also remote harvest/haul)
6+.  unchanged (reconcile/prune/economy/spawn/match/tactical)
```

`planEmpire` is declarative for the economy part (writes the plan that generators
and the energy model read) and emits `SpawnRequest`s for the imperative residue
(scouts, reservers) — mirroring how `assessDefense` both writes defense state and
returns requests.

## Staged build

Foundation (no behavior change; each independently testable):
1. **Intel & adjacency** — enriched `RoomIntel`, `describeExits`, scout creep.
2. **`targetRoom`** memory field (+ intel wipe migration).
3. **Empire layer** — allocation, `Memory.empire`, scout requests.

MVP vertical slice (energy flows; unreserved is fine):
4. **Travel-to-vision** in executors (+ `world` in executor signature).
5. **Remote harvest jobs** + matcher scope gate.
6. **Cross-room haul** (the reusable primitive; powers later currencies too).
7. **EnergyModel remote sizing** — the remote tier; makes it self-limiting.

Hardening:
8. **Reservation.**
9. **Remote defense / abandon.**

Critical path: 1 → 2 → 3 → 4 → 5 → 6 → 7. First sim-visible payoff at 5 (miner
travels); first full energy loop at 6.

## Future

Same broker, new work — additive, not new architecture:

- **Bootstrap help** (labor → newly-claimed rooms; folds in the `expansion` stub).
- **Defense help** (military → threatened owned rooms; folds in `combat`).
- **Growth acceleration** (cross-room energy; reuses the Stage 6 haul primitive).
- **Remote roads** (cross-room lane planning; hauler MOVE efficiency).
- **Per-source v2** (split a remote's sources across home rooms; the empire then
  owns the shared reserver + defense — the point at which reservation/defense
  become genuinely global).
- **Source Keeper rooms** (need combat).
