# Backlog

This backlog is organized into the four development streams defined in [docs/architecture/ECONOMY_DECOMPOSITION.md](/docs/architecture/ECONOMY_DECOMPOSITION.md).

## Stream A: Spawn & Body Heuristics (Serialized)
*Focus: Efficiency of the spawn pipeline.*

- `EE-BODY-01` Tiered Miner Body Scaling.
  Scope: Refactor `minerBody()` in `SpawnManager.ts` to use better WORK:MOVE ratios for different energy tiers.
  Implementation:
    - RCL 1-2: `[MOVE, CARRY, WORK, WORK...]` (1:1 ratio if budget permits, or at least 2 MOVE if possible).
    - RCL 3-4 (with containers): `[MOVE, CARRY, WORK...]` where 1-2 MOVE is sufficient.
    - RCL 5-8 (with links): `[MOVE, CARRY, 6*WORK]` (6 WORK to account for link transfer cooldown or travel time).
  Why: Current miners don't scale efficiently.
  Affected modules: `src/spawner/SpawnManager.ts`.

- `EE-BODY-02` Efficiency-based Hauler Sizing.
  Scope: Refactor `haulerBody()` to optimize CARRY:MOVE ratios based on RCL and road status.
  Implementation:
    - If RCL >= 4 and storage exists, use 2:1 CARRY:MOVE ratio.
    - Otherwise, stick to 1:1 CARRY:MOVE for swamp/rough terrain traversal.
  Why: 1:1 ratio is wasteful when roads are available (at RCL 4+ we usually have roads).
  Affected modules: `src/spawner/SpawnManager.ts`.

- `EE-QUEUE-02` Unified Labor Scaling.
  Scope: Adjust `pressureScore` calculation to allow for cross-role balancing factors.
  Implementation: Introduce a "starvation bonus" to hauler pressure if storage is low or spawns are empty. Introduce a "construction penalty" to worker pressure if energy is low.
  Affected modules: `src/spawner/SpawnManager.ts`.

## Stream B: Remote Mining Expansion (Independent)
*Focus: Strategic source acquisition.*

- `EE-REMOTE-03` Dynamic Remote Miner Sizing.
  Scope: Scale remote miner WORK parts based on source capacity and distance.
  Implementation:
    - Pass source capacity (1500/3000/4000) to `RemoteHarvestTask`.
    - Adjust `requirements()` to use `Math.ceil(capacity / 300 / 2)` WORK parts.
    - Adjust `minerBody()` in `SpawnManager.ts` to match these requirements.
    - For long routes (> 100 ticks round trip), add extra WORK to ensure source is depleted despite travel time.
  Why: Prevents over-spawning miners in neutral rooms and under-spawning in SK rooms.
  Affected modules: `src/spawner/SpawnManager.ts`, `src/tasks/definitions/RemoteHarvestTask.ts`, `src/plans/definitions/RemoteMiningPlan.ts`.

- `EE-REMOTE-04` RemoteStrategy Metric Refinement.
  Scope: Include CPU cost estimates in `remoteCandidateScore`.
  Affected modules: `src/rooms/RemoteStrategy.ts`.

- `EE-REMOTE-06` Remote Support Scaling.
  Scope: Scale `ReserveTask` requirements based on current reservation level and distance.
  Implementation: If reservation > 4000, 1 reserver is enough. If < 1000 or expiring soon, prioritize.
  Affected modules: `src/tasks/definitions/ReserveTask.ts`, `src/plans/definitions/ReservationPlan.ts`.

## Stream C: Hauling & Throughput (Independent)
*Focus: Solving the "starvation" problem.*

- `EE-HAUL-02` Route-Specific Friction in Hauling.
  Scope: Replace global `HAUL_TICKS_PER_TRIP` with dynamic per-task metrics in `SpawnManager.ts`.
  Implementation:
    - `deriveDemand` should accumulate `totalDistanceWeighted` from tasks.
    - `haulingFromMining` should be replaced or augmented by `demand.carryHint` which now includes real distances.
  Affected modules: `src/spawner/SpawnManager.ts`.

- `EE-HAUL-03` RemoteHaulTask Requirements Optimization.
  Scope: Update `RemoteHaulTask` to use dynamic `energyPerTick`.
  Implementation: `RemoteMiningPlan` should detect if a room is reserved (10 e/t) or not (5 e/t) and pass this to `createRemoteHaulTaskData`.
  Affected modules: `src/tasks/definitions/RemoteHaulTask.ts`, `src/plans/definitions/RemoteMiningPlan.ts`.

## Stream D: Room Growth Stages (Semi-Independent)
*Focus: Transitioning from bootstrap to surplus.*

- [x] `EE-GROWTH-01` Pressure-Aware Upgrade Throttling.

- `EE-GROWTH-03` RoomGrowth Logic Refinement.
  Scope: Refine stage transitions for RCL 4 (storage) and RCL 5 (links).
  Implementation: Add a "storage" stage that prioritizes building the storage and then switches to "remote" expansion. Add logic for "link" optimization in "surplus" stage.
  Affected modules: `src/rooms/RoomGrowth.ts`, `src/plans/definitions/EconomyPlan.ts`.

- `EE-GROWTH-04` EconomyPlan Throttling.
  Scope: Throttle `EconomyPlan` execution more aggressively based on CPU bucket.
  Implementation: Change interval from 1 to 5-10 if bucket is low. Ensure critical `DeliverTask` for spawns/extensions are still managed (maybe move them to a more frequent plan or handle locally in `WorldRoom`).
  Affected modules: `src/plans/core/PlanManager.ts`.
