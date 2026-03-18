# Review Checklist: Risky Gameplay Changes

Use this checklist when reviewing or implementing changes to **Memory**, **Spawn Heuristics**, **Remote Mining**, or **Deployment Tooling**. These systems have high cross-tick impact and can cause unrecoverable "death spirals" or broken builds.

For surgical economy or memory changes, see the [Lightweight Regression Checklist](REGRESSION_CHECKLIST.md).

---

## 1. Memory & Persistence

### Interface Consistency
- [ ] **Ambient Types**: Is the new field added to the corresponding interface in `src/main.ts` (`Memory`, `CreepMemory`, `RoomMemory`)?
- [ ] **Bootstrap/Initializers**: Does the bootstrap logic in `src/main.ts` or the relevant plan correctly initialize the new field for existing entities?
- [ ] **Serialization**: Does the new data structure survive `JSON.stringify/parse`? Avoid `Map` or `Set` unless they are manually serialized to arrays/objects.

### Data Lifecycle
- [ ] **Migration Path**: If changing a field's type or location, is there a one-time migration or a fallback to handle legacy data from existing ticks?
- [ ] **Stale Data Pruning**: Does the change introduce data that could grow indefinitely (e.g., untracked room intel)? Is there a mechanism to prune or expire it (like a `lastSeen` timestamp)?
- [ ] **Memory Bloat**: Will the new data significantly increase the `Memory` string size (Screeps limit is 2MB per tick)?

---

## 2. Spawn Balance & Labor

### Spawning Heuristics
- [ ] **Energy Floor**: Does the new heuristic preserve a minimum energy floor (e.g., `MIN_ENERGY_THRESHOLD`) to ensure bootstrap miners/haulers can always spawn?
- [ ] **Priority Inversion**: Can a low-priority spawn (e.g., a distant scout) block a high-priority one (e.g., a defender or local miner) when energy is scarce?
- [ ] **Body Cost Mismatch**: Is the generated body guaranteed to be spawnable at the current `room.energyCapacityAvailable`?
- [ ] **Replacement Cadence**: If a creep dies, does the task re-enter the queue in time to prevent a throughput gap?

### Labor Supply vs. Demand
- [ ] **Pressure Analysis**: Does the new task type correctly contribute to the `SpawnManager`'s labor demand calculation?
- [ ] **Role Overlap**: Could the new body composition accidentally fulfill a different role's requirements (e.g., a "combat" hauler taking a "scout" task)?

---

## 3. Remote Operations (Mining & Scouting)

### Throughput & Scaling
- [ ] **Route Length Updates**: Is the `routeLength` recalculated if a path is blocked or the `InterRoomRouter` updates?
- [ ] **Over-allocation**: Does the task assignment logic prevent assigning too many creeps to a single source or room?
- [ ] **Throughput Formula**: If changing `desiredHaulerCarry`, does it account for `routeLength` and `ENERGY_PER_WORK_PER_TICK` (2 energy/tick/work)?

### Safety & Visibility
- [ ] **Safety Interlocks**: Does the task correctly abort if the target room status becomes `IntelStatus.DANGEROUS`?
- [ ] **Visibility Requirement**: Does the logic correctly handle ticks where the remote room is invisible? `Game.getObjectById` will return `null`.

---

## 4. Deployment & Tooling

### Build & Bundle
- [ ] **Rollup Configuration**: If adding a new external dependency, is it correctly handled by `rollup.config.js` or included in the bundle?
- [ ] **Path Aliases**: Does the change respect the `src/` base URL and any configured path aliases in `tsconfig.json`?
- [ ] **Secret Safety**: Does the change touch `screeps.json` or any other ignored config file? Ensure no secrets are committed.

### Environment Compatibility
- [ ] **Private Server Support**: If changing `deploy` scripts, does it still work with `SCREEPS_LOCAL_PATH` for private servers?
- [ ] **Node Version**: Does the change rely on Node.js features not supported by the Screeps runtime?

---

## 5. Strategic Balance & Performance

### CPU Budgeting
- [ ] **Plan Scheduling**: If adding a new planning pass, is it registered with `PlanScheduler` and subject to `CpuBudget` tiers?
- [ ] **Global Throttling**: Does the change increase per-creep or per-tick CPU usage in a way that scales poorly (e.g., O(n²) loops)?

### Runtime Verification (Multi-Tick)
- [ ] **Energy Balance**: Is storage/container energy stable during construction or upgrading?
- [ ] **Spawn Queue Health**: Is the spawn inactive for long periods while creeps are missing?
- [ ] **Decay Losses**: Is there often >500 energy sitting on the ground in remote rooms?

---

## 6. High-Risk Economy Change Categories

These changes modify the core energy lifecycle and are prone to multi-tick failures that may not be apparent in a single tick or a simple build check.

| Change Category | Likely Failure Mode | Detection (50-200 ticks) |
| :--- | :--- | :--- |
| **Spawn Priority & Preemption** | **Energy Death Spiral**: Essential roles (Miners/Haulers) get starved by non-essential roles (Scouts/Upgraders) during energy crises. | `room.energyAvailable` stays low while `SpawnManager` requests expensive non-economy creeps. |
| **Body Composition & Cost Scaling** | **Throughput Collapse**: Creeps are too slow (fatigue > 0) or too expensive to allow for backup spawns if they die. | Creeps spend >50% of life moving; single death halts room economy for >150 ticks. |
| **Hauling Throughput Metrics** | **Remote Overflow**: Energy decays in containers or on the ground because haulers can't keep up with mining rate. | `ENERGY_DECAY` events in remote rooms; containers staying at 2000/2000 capacity. |
| **Pressure & Demand Smoothing** | **Hysteresis / Delayed Response**: AI takes too long to react to sudden labor losses (e.g., invader deaths). | Labor supply stays below demand for >100 ticks after a mass-death event. |
| **Remote Mining Lifecycle** | **The Meat Grinder**: Creeps are repeatedly sent to a room where they are killed by invaders or owners. | `Creep.ticksToLive` average drops significantly; `Memory.tasks` shows high turnover. |

---

## 7. Baseline Compliance

- **Mandatory Build**: `npm run build` MUST pass without errors.
- **Dry-Run Validation**: For complex logic, verify the first 100 ticks in the simulator or a private server.
- **Incremental Linting**: Only new or modified lines are expected to follow current lint rules.
