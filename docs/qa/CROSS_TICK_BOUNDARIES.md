# Cross-Tick State Boundaries

The highest-risk state boundaries in the rebuilt AI. Because planning is CPU-throttled and `Memory`
persists across ticks, understanding where state flows between subsystems is key to avoiding
regressions. See [../architecture/MODULAR_ARCHITECTURE.md](../architecture/MODULAR_ARCHITECTURE.md).

## 1. Job lifecycle (generation → execution)

**Boundary**: `Memory.jobs` ↔ `JobBoard` ↔ generators ↔ `Matcher` ↔ executors

- **Flow**:
  1. Generators (`src/jobs/generators/*`) `upsert` jobs by deterministic id each tick.
  2. `JobBoard.reconcile()` drops dead/desynced assignments; `prune()` removes invalid-target jobs.
  3. `Matcher` assigns idle creeps, writing `CreepMemory.jobId` and `job.assigned[]`.
  4. `runCreep` looks up the job and runs its executor.
  5. `JobBoard.persist()` writes back to `Memory.jobs`.
- **Risks**:
  - **Dangling reference**: a creep keeps a `jobId` for a pruned job. Mitigated by `reconcile` (clears
    desynced ids) and `runCreep` (deletes a `jobId` whose job is gone) — keep both honest.
  - **Duplicate jobs**: non-deterministic ids would create duplicates each tick. Always use stable ids.
  - **Stale jobs**: a generator that stops emitting a job relies on `prune` validity to remove it.

## 2. Spawn demand (jobs/requests → spawning)

**Boundary**: `Memory.jobs` + `SpawnRequestQueue` ↔ `SpawnManager`

- **Flow**:
  1. `SpawnManager` reads controller `SpawnRequest`s (priority-first) and economy demand
     (`JobBoard.demand` vs `laborSupply`).
  2. A population floor guarantees a generalist when a room has no working labor.
- **Risks**:
  - **Demand collapse**: if generators fail to create jobs, economy demand reads zero — the floor is
    the backstop that prevents a death spiral.
  - **Over-spawning**: incorrect `job.demand` or `capacity` inflates demand. Demand counts open slots
    only, so it should fall to zero as the matcher fills slots.
  - **Priority starvation**: a controller request with very high priority can monopolize a spawn; size
    priorities per the [Spawn Request Contract](../architecture/SPAWN_REQUEST_CONTRACT.md).

## 3. Hybrid command ownership (matching vs controllers)

**Boundary**: `CreepMemory.controller` ↔ `Matcher` ↔ `commandControllerCreeps`

- **Flow**: creeps spawned with an `owner` carry `CreepMemory.controller`; `idleEconomyCreeps` excludes
  them, and they are driven imperatively in the tactical phase.
- **Risks**:
  - **Orphaned controller creep**: if a subsystem stops commanding a creep but leaves `controller` set,
    the matcher never picks it up and it idles. Clear `controller` when handing a creep back to economy.

## 4. Room intelligence (scouting → strategy)

**Boundary**: `RoomMemory.intel` ↔ `Scouting` ↔ planners

- **Flow**: `updateIntel` writes `RoomIntel` for visible rooms; strategy passes read it.
- **Risks**:
  - **Staleness**: `intel.lastSeen` ages — consumers must tolerate old data and missing rooms.

## 5. Scheduling (CPU budget → passes)

**Boundary**: `Memory.planRuns` ↔ `Scheduler.shouldRun` ↔ `CpuBudget`

- **Flow**: non-critical passes (scouting, base planning) run via `shouldRun(key, interval)`, stretched
  when `Game.cpu.bucket` is low. Defense and economy generation run every tick.
- **Risks**:
  - **Starvation**: marking a critical pass as throttled could skip it when the bucket is low. Keep
    defense and economy generation off the scheduler.

## 6. Base layout → construction → build jobs

**Boundary**: `RoomMemory.base` ↔ `BasePlanner` ↔ construction sites ↔ build generator

- **Flow**: `BasePlanner` (throttled) caches an anchor and places capped construction sites; the build
  generator turns visible sites into a room-level build job; `prune` removes it when sites run out.
- **Risks**:
  - **Site bloat**: `MAX_SITES_PER_RUN` caps placement per run — don't remove the cap.
  - **Anchor staleness**: the cached anchor survives until the base pass runs again.

## 7. Tower defense

**Boundary**: `Towers` ↔ `WorldRoom.towers` ↔ structure hits

- **Flow**: every tick, towers attack hostiles, then heal, then repair critical non-fortification
  structures (only above an energy threshold).
- **Risks**:
  - **Single point of failure**: maintenance currently relies on towers; there is no creep `repair`
    job yet (a future seam).
  - **Energy drain**: aggressive repair can starve spawning — respect `TOWER_MIN_ENERGY_TO_REPAIR`.

## 8. Execution order

`src/main.ts` defines a strict order: strategy posts jobs/requests → reconcile/prune → spawn → match →
tactical. Later steps see earlier steps' state. Reordering without auditing dependencies (e.g. matching
before reconcile) can assign creeps to invalid jobs.
