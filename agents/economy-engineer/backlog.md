# Backlog

This backlog is organized into the four development streams defined in [docs/architecture/ECONOMY_DECOMPOSITION.md](/docs/architecture/ECONOMY_DECOMPOSITION.md).

## Stream A: Spawn & Body Heuristics (Serialized)
*Focus: Efficiency of the spawn pipeline.*

- `EE-BODY-01` Tiered Miner Body Scaling.
  Scope: Refactor `minerBody()` in `SpawnManager.ts` to use better WORK:MOVE ratios for different energy tiers (e.g., RCL 1-3 vs 4-8).
  Why: Current miners are too simple and don't scale efficiently with higher energy capacities.
  Affected modules: `src/spawner/SpawnManager.ts`.

- `EE-BODY-02` Efficiency-based Hauler Sizing.
  Scope: Refactor `haulerBody()` to optimize CARRY:MOVE ratios based on road coverage and energy tiers.
  Why: Current haulers always use 1:1 MOVE:CARRY, which is inefficient if roads are present.
  Affected modules: `src/spawner/SpawnManager.ts`.

- `EE-QUEUE-02` Unified Labor Scaling.
  Scope: Adjust `pressureScore` calculation to allow for cross-role balancing factors (e.g., favoring haulers over workers when storage is low).
  Why: Current pressure is role-isolated, leading to starvation scenarios where we build but can't haul.
  Affected modules: `src/spawner/SpawnManager.ts`.

- `EE-QUEUE-03` Pressure Coefficient Tuning.
  Scope: Tune `PRESSURE_ALPHA`, `TASK_CARRY_WEIGHT`, and `PRESSURE_SPAWN_THRESHOLD` in `SpawnManager.ts`.
  Why: Current values are guestimated; need tuning based on actual performance to prevent oscillation and ensure responsive spawning.
  Affected modules: `src/spawner/SpawnManager.ts`.

- `EE-QUEUE-X1` Shared spawn-request contract for economy versus expansion.
  Reason deferred: Crosses role boundaries with `technical-architect`. Requires unified precedence for expansion and bootstrap requests.
  Likely modules: `src/spawner/SpawnManager.ts`, `src/spawner/SpawnRequests.ts`, `src/plans/definitions/SupportPlan.ts`.

## Stream B: Remote Mining Expansion (Independent)
*Focus: Strategic source acquisition.*

- `EE-REMOTE-03` Dynamic Remote Miner Sizing.
  Scope: Scale remote miner WORK parts based on source distance to optimize "Time-to-Harvest" vs "Lifetime" efficiency.
  Why: Long-distance remotes waste too much time traveling if their body is too large (long spawn time) or too small (low throughput).
  Affected modules: `src/plans/definitions/RemoteMiningPlan.ts`, `src/spawner/SpawnManager.ts`.

- `EE-REMOTE-04` RemoteStrategy Metric Refinement.
  Scope: Refactor `remoteCandidateScore` in `RemoteStrategy.ts` to include CPU cost estimates and better pathing weights.
  Why: Current scoring is purely distance/source based; doesn't account for path complexity or CPU impact of long-range hauling.
  Affected modules: `src/rooms/RemoteStrategy.ts`.

- `EE-REMOTE-05` Scouting Freshness Coordination.
  Scope: Coordinate with `operations-engineer` to ensure `ScoutingPlan` prioritizes rooms near high-potential remotes.
  Why: `RemoteStrategy` relies on fresh intel; stale data leads to sub-optimal remote choices or missed opportunities.
  Affected modules: `src/plans/definitions/ScoutingPlan.ts` (inbox request).

## Stream C: Hauling & Throughput (Independent)
*Focus: Solving the "starvation" problem.*

- `EE-ECON-01` Link-Aware Hauling.
  Scope: Optimize `RemoteHaulTask` and `DeliverTask` to deliver to the closest available link in the room (sink link) if storage is further away or full.
  Why: Reduces internal travel distance for haulers, increasing throughput and saving CPU.
  Affected modules: `src/tasks/definitions/RemoteHaulTask.ts`, `src/tasks/definitions/DeliverTask.ts`, `src/plans/definitions/LinkPlan.ts`.
  Guardrails: Only deliver to links if they have enough free capacity to avoid haulers standing idle.

- `EE-HAUL-02` Route-Specific Friction in Hauling.
  Scope: Replace global `HAUL_TICKS_PER_TRIP` constant in `SpawnManager.ts` with dynamic per-room metrics derived from actual path distances to sources.
  Why: Global constant overestimates hauling needs in compact rooms and underestimates them in spread-out rooms.
  Affected modules: `src/spawner/SpawnManager.ts`, `src/rooms/ResourceManager.ts`.

- `EE-HAUL-03` RemoteHaulTask Requirements Optimization.
  Scope: Refactor `requirements()` in `RemoteHaulTask.ts` to use dynamic `energyPerTick` and actual route length.
  Why: Current requirements are hardcoded to 10 energy/tick, which is inaccurate for many sources and leads to over/under-spawning haulers.
  Affected modules: `src/tasks/definitions/RemoteHaulTask.ts`.

## Stream D: Room Growth Stages (Semi-Independent)
*Focus: Transitioning from bootstrap to surplus.*

- `EE-GROWTH-01` Pressure-Aware Upgrade Throttling.
  Scope: Adjust `EconomyPlan.ts` to throttle `UpgradeTask` demand when room pressure is high or storage is low.
  Why: Prevents upgrading from starving the spawn/build pipeline during critical growth phases.
  Affected modules: `src/plans/definitions/EconomyPlan.ts`, `src/rooms/RoomGrowth.ts`.
  Guardrails: Ensure minimal upgrading continues to prevent controller downgrade.

- `EE-GROWTH-02` Improved Bootstrap Task.
  Scope: Refactor `BootstrapTask.ts` to handle transition from "empty room" to "RCL 1 with container" more smoothly.
  Why: Current bootstrap is often too slow or gets stuck if it can't find energy.
  Affected modules: `src/tasks/definitions/BootstrapTask.ts`.

- `EE-GROWTH-03` RoomGrowth Logic Refinement.
  Scope: Refine `updateRoomGrowth` in `src/rooms/RoomGrowth.ts` to better handle stage transitions (e.g. RCL 4 storage, RCL 5 links).
  Why: Stage transitions are currently a bit jarring and can cause temporary economy dips or inefficient link usage.
  Affected modules: `src/rooms/RoomGrowth.ts`, `src/plans/definitions/EconomyPlan.ts`.
