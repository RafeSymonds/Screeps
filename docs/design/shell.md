# Shell Design

Status: draft — M1, revised after fresh-context review
Parent: [architecture.md](architecture.md) §5.1 (also §3 normative tick order, principles 6–7, §6).

## Goal

The one place that knows the tick's outermost order, and the layer that makes every other
subsystem safe to be naive: by the time anything else runs, Memory is present, versioned,
and migrated; dead creeps are pruned; world discontinuity has been handled; and
everything runs inside containment. Success criteria:

- `main.ts` contains no runtime logic beyond the wrap-loop shim (plus the repo-convention
  ambient Memory declarations, which grow with the schema).
- Any Memory the bot has ever written can be loaded by current code: migrated forward,
  or deliberately reset with an alert — never a crash loop.
- Account respawn (world discontinuity) is detected and recovered from without human
  cleanup, preserving intel — across global resets, because detection state is persisted,
  never heap.

## Interface

```ts
// src/main.ts (shim)
export const loop = ErrorMapper.wrapLoop(shell.tick);
// main.ts also declares the ambient Memory/CreepMemory extensions (repo convention).
// M1 ambient surface: Memory.version: number, Memory.shell: ShellMemory,
// Memory.rooms: Record<string, RoomMemory-ish (empty at M1)>, Memory.intel: {},
// Memory.stats?: StatsMemory (telemetry-owned), CreepMemory {} (empty at M1).

// src/shell/index.ts
export function tick(): void;

// src/shell/entries.ts — THE normative tick order (architecture §3) as data
export const ENTRIES: ScheduledEntry[];
// M1: [ { id: TelemetryFlush, cpuClass: C, interval: FLUSH_INTERVAL, phase: 0, run: telemetry.flush } ]
// grows per milestone in architecture §3's order; changing the order = architecture change

// src/shell/memory.ts
export const CURRENT_VERSION: number;                 // starts at 1
export const CONTAINERS: readonly (keyof Memory)[];   // M1: ["rooms", "intel", "shell"] —
                                                      // stats EXCLUDED: telemetry self-initializes its slice
export function ensureAndMigrate(): void;
export interface Migration { to: number; run(mem: Memory): void }
export const MIGRATIONS: Migration[];                 // append-only, sequential

// src/shell/continuity.ts
export function checkWorldContinuity(ownedNow: string[]): void;   // detection + GC + tracking update
export const KEEP_ON_RESET: readonly (keyof Memory)[];            // ["intel", "stats", "version"] —
                                                                  // the ONE keep-list, used by both reset paths

// src/shell/creepGc.ts
export function cleanDeadCreepMemory(): void;
```

Wiring assertions (unit-tested, not runtime-checked): `ENTRIES` ids are unique, order
matches the architecture's normative list (kept as a literal in the test so reordering is
a conscious two-file change), and same-interval entries have distinct `phase`s
(scheduler.md stagger rule).

The shell computes `ownedNow` by iterating `Game.rooms` for owned controllers, and the
creep GC iterates `Game.creeps`/`Memory.creeps` — the documented exception to snapshot's
traversal monopoly (snapshot.md Goal): these run *before* the snapshot exists and use
plain object iteration, never `find`.

## Memory Schema

Owner of `Memory.version` and `Memory.shell` (architecture §6). The shell also **ensures
the `CONTAINERS` exist** (`Memory.rooms ??= {}` …) so slice owners never null-check their
roots; owners own everything *inside* their container. `Memory.stats` is deliberately not
ensured here — telemetry is the sole initializer of its own slice (telemetry.md), which
is what makes `countReset` safe to call at any point.

```ts
interface ShellMemory {
    /** Room names we owned as of the last completed tick. Persisted — this is what makes
     *  loss/respawn detection work across global resets and long dead periods. */
    owned: string[];
    /** Rooms that left `owned`, with the tick we noticed. Drives grace-period GC. */
    lostAt: Record<string, number>;
}
```

### Bootstrap policies, in order of application

1. **Fresh world** (no `Memory.version`): initialize containers, set
   `version = CURRENT_VERSION`. No migrations run.
2. **Older version**: run `MIGRATIONS` sequentially from `Memory.version` to
   `CURRENT_VERSION`. Migrations are append-only and never deleted; each is unit-tested
   against a fixture of the shape it migrates. (At M1 the ladder is empty; the machinery
   is tested with a synthetic test-only migration list so it works before it matters.)
3. **Newer version** (rolled-back deploy): reset every slice **except `KEEP_ON_RESET`**
   (intel and stats survive — stats is the evidence layer the §2 criteria are judged on;
   destroying it on a messy deploy would blind us exactly when we need it), set
   `version = CURRENT_VERSION`, `alert(Discontinuity)`.
4. **Corrupt slice** (bootstrap or a migration throws): reinitialize *that container*
   fresh, `countError(Shell, err)`, `alert(CorruptSlice)`, continue. Fail-forward per
   slice; never crash-loop the whole bot over one slice's bad data.

### World continuity (respawn, room loss)

All detection diffs `ownedNow` against the **persisted** `Memory.shell.owned` — heap
state cannot be trusted to exist (primer: heap can vanish any tick; dead periods span
hours). Cases, checked each tick after bootstrap:

- **Fresh world** (`shell.owned` empty, nothing remembered): record `owned`, done.
- **Normal continuity** (`ownedNow` ⊇ `shell.owned`): record, clear any `lostAt` entries
  for re-acquired rooms.
- **Partial loss** (`ownedNow` lost some of `shell.owned`, still owns others): for each
  newly lost room — `alert(RoomLost)` once (it's a transition, not a state, so this fires
  exactly once per loss even across resets), stamp `lostAt[room] = Game.time`. GC that
  room's entries across `Memory.rooms[name]` after `LOST_ROOM_GRACE` (provisional: 3000
  ticks — owners may want post-mortem state briefly). Owned rooms are always visible in
  Screeps, so "not owned now" is reliable knowledge, not a visibility artifact.
- **Total loss** (`ownedNow` empty, `shell.owned` wasn't): `alert(RoomLost)` for the
  transition, record `owned = []`, **no reset** — we're dead awaiting manual respawn
  placement (architecture §2's one human touchpoint), and wiping now would erase intel
  exactly when expansion scoring (M6) wants it.
- **Respawn** (`shell.owned` empty, rooms remembered in `Memory.rooms`/`lostAt` history,
  and `ownedNow` is non-empty): we came back from total loss — **discontinuity**,
  *regardless of where the new spawn landed*. This deliberately catches respawning into
  a room we remember (old-world slices for that room are stale artifacts of a previous
  life, not context worth keeping). Selective reset: every slice except `KEEP_ON_RESET`,
  wipe all `CreepMemory`, reset `Memory.shell` to the new world, `alert(Discontinuity)`.
  A useful consequence: the same trigger fires on a **remembered world the shell never
  saw** — e.g. deploying this bot over a previous bot's leftover Memory — so foreign
  room slices are cleared (intel kept) instead of being trusted.

New slices are reset by default on both reset paths unless deliberately added to
`KEEP_ON_RESET` — one named list in one file.

## Tick Flow

The whole tick, top to bottom — this list *is* `shell.tick()`:

1. **`telemetry.beginTick(Game.time)`** (heap-only, safe before bootstrap). Then reset
   detection: module-scope `booted` flag false on a fresh heap →
   `telemetry.countReset(Game.time)` (safe pre-bootstrap: telemetry self-initializes its
   slice), set flag.
2. **Memory bootstrap**: `ensureAndMigrate()` (policies above).
3. **World continuity check** (+ tracking update, lost-room GC).
4. **Dead-creep cleanup**: delete `Memory.creeps[name]` for creeps absent from
   `Game.creeps`.
5. **Snapshot build** → `TickContext`; metered via `reporter.entryRan(Snapshot, …)`.
6. **`scheduler.runTick(ENTRIES, ctx, gameCpuMeter, telemetry.reporter)`** — everything
   else the bot does happens in here.
7. **`telemetry.endTick(Game.cpu.getUsed(), Game.cpu.limit, Game.cpu.bucket)`**.

Steps 2–4 are metered together as the `Shell` pseudo-entry (`reporter.entryRan(Shell, …)`),
so bootstrap cost is visible per-entry from day one; the Memory-parse cost triggered by
first access lands in it too, which is exactly where §9's parse line item gets its real
number.

**Containment and dependencies**: each step is individually trapped. Failures in
independent steps (3, 4) are counted (`countError(Shell, err)`) and the tick continues.
A failure in a step later steps depend on — bootstrap (2) or snapshot (5) — skips
forward to step 7: no scheduler run on a tick whose foundations are broken, but `endTick`
always runs so the evidence of the failure persists. The outer `ErrorMapper.wrapLoop`
stays as last resort for anything escaping the shell itself.

**Ordering invariant (do not break in future reorders)**: dead-creep GC (4) runs before
any spawn intents (inside 6). `spawnCreep` writes `Memory.creeps[name]` at tick T but the
creep appears in `Game.creeps` only from T+1 — GC at step 4 is safe *only because* no
spawn intent has run yet this tick; a GC moved after the scheduler would delete newborn
memories.

## Edge Cases

- **First tick ever / first tick after respawn placement**: fresh-world path, empty
  containers, zero creeps — every step no-ops cleanly (asserted in sim from tick 1 of the
  `default` scenario).
- **Migration + discontinuity on the same tick** (respawn detected right after a version
  bump): bootstrap runs first, migrations see old-world data, then discontinuity wipes
  most of it. Wasted work, correct result — no ordering hazard.
- **Spawning creeps**: exist in `Game.creeps` from the tick after `spawnCreep`, so GC
  never deletes them; the tick-T window is covered by the ordering invariant above.
- **Re-claim within the grace window**: stale slices for the re-acquired room are older
  than the reclaim — owners already tolerate stale/absent data per architecture §8's
  degraded-input contracts, and `lostAt` is cleared on re-acquisition; GC just never
  fires.
- **Heap survives, Memory swapped** (manual surgery, sim scenario resets): version +
  container checks run every tick, not just after resets, so bootstrap heals it the tick
  it happens; continuity detection is unaffected because its state is in the swapped
  Memory itself.

## Test Plan

Unit (mocha, mocked `Game`/`Memory` from `test/helpers/`):

- Migration ladder: synthetic migration list — fixtures at each version migrate to
  current and pass a shape check; newer-version fixture triggers the KEEP_ON_RESET reset
  + alert; a throwing migration reinitializes only its container and the tick continues
  (spy ordering).
- Continuity matrix: all six cases above, asserting exactly which slices survive, that
  intel + stats are kept on discontinuity, that `CreepMemory` is wiped on respawn, that
  `RoomLost` fires once per transition (including across a simulated heap wipe — the
  `booted` flag resets, `Memory.shell` doesn't), and that respawn-into-a-remembered-room
  takes the discontinuity path.
- GC: dead creep memory removed, live and spawning creeps untouched; lost-room slices
  removed only after `LOST_ROOM_GRACE`; `lostAt` cleared on re-claim.
- ENTRIES wiring: unique ids, normative order literal, distinct phases per interval.

Sim (`bin/sim test` — the **M1 milestone gate**, extending the existing smoke suite;
requires extending `sim/lib/harness.js` to expose the bot's final Memory in
`runScenario()` results, which the server mockup's bot API supports — that harness change
is in-scope for M1): on `default`, run ~200 ticks and assert zero uncaught errors,
`Memory.version === CURRENT_VERSION`, `Memory.stats.ring` non-empty,
`counters.errors === 0`, and `shell`/`snapshot`/`telemetryFlush` entries present in ring
windows with avgCpu < 5 (provisional sanity bound for an empty bot, tightened once real
numbers exist). On `wiped-base`, assert the bot ticks cleanly with
structures-but-no-creeps (full recovery behavior is M4's gate; M1 only proves we don't
crash).
