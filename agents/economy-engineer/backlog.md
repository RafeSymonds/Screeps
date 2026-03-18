# Backlog

## Refined Implementation Slices

- `EE-QUEUE-01` Deterministic Spawn Request Normalization.
  Scope: Separate "Emergency Bootstrap" logic from "Pressure-based Scaling" in `SpawnManager`. Ensure that empty roles get immediate, high-priority requests that bypass smoothed pressure averages.
  Why: Current logic can leave rooms "stuck" if demand is low but supply is 0, leading to 0 pressure.
  Affected modules: `src/spawner/SpawnManager.ts`, `src/spawner/SpawnRequests.ts`.
  Guardrails: Emergency priority must drop as soon as a creep is `spawning` or `alive` to allow other rooms to use the spawn.

- `EE-REMOTE-02` Stable Remote Mining Lifecycle.
  Scope: Introduce a `reserved` state and score hysteresis to `RemoteStrategy`. Prevent remotes from flip-flopping between `active` and `saturated` due to tick-to-tick volatility in `ownerCapacityScore`.
  Why: Prevents wasted CPU and pathing churn when remote assignments oscillate.
  Affected modules: `src/rooms/RemoteStrategy.ts`, `src/plans/definitions/RemoteMiningPlan.ts`.
  Guardrails: Do not block "unsafe" room transitions; priority should always be safety first.

- `EE-HAUL-01` Dynamic Local Hauling Requirements.
  Scope: Replace hardcoded `energyPerTick = 10` and `distance = 8` in `DeliverTask.requirements()` with values derived from actual source throughput and path distances. Also update `RemoteHaulTask.requirements()`.
  Why: Current static hints cause over-spawning in small rooms and under-spawning in large, spread-out rooms.
  Affected modules: `src/tasks/definitions/DeliverTask.ts`, `src/tasks/definitions/RemoteHaulTask.ts`, `src/rooms/ResourceManager.ts`, `src/spawner/SpawnManager.ts`.
  Guardrails: Use cached distances from `RemoteStrategy` or `RoomTopology` to avoid per-task pathfinding CPU costs.

- `EE-ECON-01` Link-Aware Remote Hauling.
  Scope: Optimize `RemoteHaulTask` to deliver to the closest available link in the `ownerRoom` (sink link) if storage is further away or full.
  Why: Reduces internal travel distance for remote haulers, increasing throughput and saving CPU.
  Affected modules: `src/tasks/definitions/RemoteHaulTask.ts`, `src/plans/definitions/LinkPlan.ts`.
  Guardrails: Only deliver to links if they have enough free capacity to avoid haulers standing idle.

## Deferred Or Shared Follow-Ups

- `EE-QUEUE-X1` Shared spawn-request contract for economy versus expansion.
  Reason deferred: Crosses role boundaries with `technical-architect`. Requires unified precedence for expansion and bootstrap requests.
  Likely modules: `src/spawner/SpawnManager.ts`, `src/spawner/SpawnRequests.ts`, `src/plans/definitions/SupportPlan.ts`.
- `EE-REMOTE-X1` Remote activation scoring and owner reassignment.
  Reason deferred: Sliced into `EE-REMOTE-02` for immediate stability; broader scoring overhaul requires more telemetry.
