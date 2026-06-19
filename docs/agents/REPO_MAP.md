# Repo Map

Subsystem-by-subsystem map of the rebuilt (June 2026) modular AI. For the design rationale see
[../architecture/MODULAR_ARCHITECTURE.md](../architecture/MODULAR_ARCHITECTURE.md).

## Tick Flow

The kernel in [src/main.ts](../../src/main.ts) runs each tick:

1. `bootstrapMemory()` — init `Memory` collections + version-gated migrations.
2. `new JobBoard(); board.rehydrate()` + `cleanDeadCreeps()` + `ensureCreepMemory()` (self-heal any
   creep missing `home`/`spawnRole`/`working`).
3. `new World()` — build the per-tick read model.
4. `updateIntel(world)` — scouting, throttled by `shouldRun("scout", …)`.
5. Strategy: `assessDefense`, `generateJobs`, `planBase` (throttled), `planExpansion`/`planCombat`
   (stubs). These post jobs to the board and `SpawnRequest`s to the queue.
6. `board.reconcile()` + `board.prune(world)`.
6.5. `senseEconomy(world)` — update each room's storage EMA/trend (energy-flow integrator).
7. `spawnManager.run(world, board, spawnQueue)`.
8. `matcher.assign(idleEconomyCreeps(world, board), board, world)`.
9. Tactical: `runTowers(world)`, `commandControllerCreeps(world)`, `buildLedger(world)` (energy
   reservations), then `runCreep(creep, board, world, ledger)` per economy creep.
10. `board.persist()`.
11. `Game.cpu.generatePixel()` when the bucket is high.

## Layers and contracts

Two contracts connect everything:

- **`Job`** (`src/jobs/types.ts`) — a persistent unit of economic/build work with a labor `demand`,
  stored in `Memory.jobs` under a deterministic id. Produced by generators; consumed by matching and
  spawning.
- **`SpawnRequest`** (`src/spawn/types.ts`) — a controller subsystem asking for a creep through the
  shared spawn service, with a priority and `owner` tag.

## Main Subsystems

### `src/world`
- `World.ts`: per-tick world — owned rooms + all creeps.
- `WorldRoom.ts`: one room scanned once — sources, spawns/extensions/towers, containers, sites,
  hostiles, dropped energy, energy sinks/stores. Also `miningContainers()`, `backlogEnergy()`
  (undelivered energy — the under-haul signal), `storageEnergy()`. Everything reads from here, not
  `room.find`.

### `src/cpu`
- `CpuBudget.ts`: bucket tiers (Critical/Low/Normal/High), throttle multiplier, pixel policy.
- `Scheduler.ts`: `shouldRun(key, interval)` keyed by `Memory.planRuns`, stretched when the bucket is low.

### `src/jobs`
- `JobBoard.ts`: index over `Memory.jobs` — `rehydrate`/`persist`, `upsert` (idempotent), `assign`,
  `reconcile` (drop dead/desynced assignments), `prune` (invalid targets), `demand(roomName)`.
- `generators/*`: one generator per economy job kind (harvest/haul/upgrade/build/repair), registered in
  `generators/index.ts`.

### `src/matching`
- `capability.ts`: `canPerform(creep, job)` — required parts per job kind. The only thing that gates
  whether a creep can do a job. No behavioral role.
- `scoring.ts`: `score(creep, job)` — priority minus range/away-from-home penalties (swappable).
- `Matcher.ts`: `GreedyMatcher` assigns creeps by **capability (hard gate) + need (soft preference)**.
  Capability is the only veto, so a capable creep is **never left idle while open work it can do
  exists**. Among doable jobs it ranks needed-first — `jobNeeded` makes mining a last resort (a creep
  with CARRY prefers collecting to mining; haul is preferred only when there is energy to move) — then
  least-staffed/priority/proximity. Crucially "need" is a tiebreak, not a gate: when collection slots
  are full a carrier still takes an open harvest job rather than standing idle. `economyCreepsToMatch`
  re-includes EMPTY creeps so they re-decide as need changes; the switch rule (`shouldSwitch`: move only
  when capability is lost, needed work opens while the current job is no longer needed, or a job of equal
  need is strictly less-staffed excluding self) keeps churn low.

### `src/actions`
- `primitives.ts`: atomic intents (move/harvest/transfer/withdraw/pickup/upgrade/build/repair) +
  `toggleWorking` gather/act phase flag.
- `ledger.ts`: `LogisticsLedger` + `buildLedger(world)` — the per-tick **energy reservation tracker**.
  Sums, per target, how much energy creeps already heading there will take/give (rebuilt each tick from
  `srcTargetId`/`sinkTargetId` in creep memory; full-load assumption, capped by availability). Routing
  scores against `available − reserved`, so the workforce spreads across sources/sinks instead of
  herding onto the nearest one. Full design: [../architecture/LOGISTICS_ROUTING.md](../architecture/LOGISTICS_ROUTING.md).
- `logistics.ts`: scored energy policy. `pickEnergySource`/`pickEnergySink` are pure scorers —
  `argmax(base + deliverable·amountWeight − distance·distWeight)`, where **deliverable** (how much this
  creep can actually take/give after ledger reservations) dominates. `resolveEnergySource`/
  `resolveEnergySink` wrap them with **stickiness**: keep a committed target across ticks, revalidate,
  re-pick only when gone/empty/full, and record the claim. `pickBuildSite` ranks construction.
  `EnergySourceKind` enum tags the source intent.
- `energy.ts`: `acquireEnergy(creep, room, ledger)` — gather via `resolveEnergySource`, fall back to
  harvesting a source.
- `executors/*`: one executor per job kind; `executors/index.ts` registers them and exposes
  `runCreep(creep, board, world, ledger)` — **the documented insertion point for the future
  task-chaining layer**.

### `src/economy`
- `EnergyModel.ts`: the energy-flow spawn controller. `senseEconomy` (per-tick storage EMA/trend),
  `roomDemand` (income / logistics / consumption targets vs supply), `pickDeficitRole` (spawn the
  largest deficit). See [../architecture/ENERGY_FLOW_SPAWNING.md](../architecture/ENERGY_FLOW_SPAWNING.md).
- `types.ts`: `EconomyMemory`, `LaborKind`, `RoomDemand`.

### `src/spawn`
- `SpawnManager.ts`: merges controller `SpawnRequest`s (priority-first) with economy demand from the
  `EnergyModel` (spawns the most under-supplied flow stage), applies a population **floor**, sizes a
  body, and spawns. Tags `spawnRole`/`home`/`working`/`controller`.
- `bodies.ts`: `buildBody(role, energy)` + `bodyCost`. `queue.ts`: `SpawnRequestQueue`.

### `src/defense`
- `Defense.ts`: `assessDefense` flags threats, triggers safe mode as a last resort, returns
  `SpawnRequest`s (defenders are a future expansion).
- `Towers.ts`: attack → heal → repair-critical.

### `src/base`
- `BasePlanner.ts`: minimal — anchor on first spawn, place source containers + RCL-gated extensions
  (capped per run). Emits construction sites; the build generator turns them into jobs.

### `src/intel`
- `Scouting.ts`: passive — write `RoomIntel` for every visible room.

### `src/controllers`, `src/expansion`, `src/combat`, `src/tasks`
- Seams. `controllers/index.ts` dispatches controller-commanded creeps to their subsystem.
  `expansion`/`combat` are no-op stubs that will post `SpawnRequest`s and command creeps. `tasks/Task.ts`
  reserves the task-chaining layer.

## Important Data Contracts

- `Memory.jobs` — canonical persisted job list (deterministic ids).
- `Memory.planRuns` — per-pass scheduling timestamps.
- `Memory.creeps[name]` — `spawnRole`, `home`, `working`, `jobId?`, `srcTargetId?`/`sinkTargetId?`
  (sticky logistics targets), `controller?`.
- `Memory.rooms[name]` — `intel?` (scouting), `base?` (planning), `defense?` (threat flags),
  `economy?` (storage EMA/trend for the energy-flow controller).
- Ambient interfaces live in [src/main.ts](../../src/main.ts); initializer in
  [src/memory/bootstrap.ts](../../src/memory/bootstrap.ts).

## Change Guidance

- Add a job kind → add a generator, a capability entry, and an executor; nothing else.
- Add room intelligence → extend `RoomIntel` and the ambient `RoomMemory` type.
- Change plan cadence → update intervals in `src/config/constants.ts`; verify `Memory.planRuns` effects.
- Change spawn heuristics → tune `ECONOMY_*` in `src/config/constants.ts`; verify the floor still
  prevents collapse and that `pickDeficitRole` returns null when staffed (self-limits). See
  [../architecture/ENERGY_FLOW_SPAWNING.md](../architecture/ENERGY_FLOW_SPAWNING.md).
- Change energy routing (what to haul/build/withdraw, who goes where) → edit the scored policy in
  `src/actions/logistics.ts` (weights in `LOGISTICS_*`); reservation/coordination lives in
  `src/actions/ledger.ts`. See [../architecture/LOGISTICS_ROUTING.md](../architecture/LOGISTICS_ROUTING.md).
