# Backlog

## Reviewed Codepaths

- `src/main.ts` runs plans before spawn selection, so any queue cleanup has to account for both task-derived demand and plan-authored `room.memory.spawnRequests`.
- Spawn demand is synthesized in `src/spawner/SpawnManager.ts` from task requirements plus smoothed pressure, then merged with explicit requests from `SupportPlan`, `ReservationPlan`, and other plan writers through `src/spawner/SpawnRequests.ts`.
- Local hauling demand enters through `src/plans/defintions/EconomyPlan.ts` and `src/tasks/definitions/DeliverTask.ts`.
- Remote mining demand enters through `src/plans/defintions/RemoteMiningPlan.ts`, `src/tasks/definitions/RemoteHarvestTask.ts`, `src/tasks/definitions/RemoteHaulTask.ts`, and `src/rooms/ResourceManager.ts`.

## First Delegation Slices

- `EE-QUEUE-01` Spawn baseline request normalization.
  Scope: make baseline miner/hauler/worker requests deterministic and easier to reason about without changing non-economy request producers.
  Why first: this is the narrowest slice that directly unblocks cleaner queueing for economy and expansion work.
  Affected modules: `src/spawner/SpawnManager.ts`, `src/spawner/SpawnRequests.ts`.
  Guardrails: do not edit plan request producers; treat request precedence, expiry, and `requestedBy` namespacing as the only public contract.
  Notes: this slice should explicitly document how baseline requests coexist with `bootstrap:*`, `reserve:*`, and future expansion request keys.

- `EE-HAUL-01` Local hauling carry-hint cleanup.
  Scope: replace the fixed carry hint in `DeliverTask` with a target-aware heuristic and remove hot-path debug logging from deliver-task reassignment.
  Why next: it improves economy spawn pressure without touching remote ownership or shared queue semantics.
  Affected modules: `src/tasks/definitions/DeliverTask.ts`, `src/plans/defintions/EconomyPlan.ts`.
  Guardrails: keep task IDs stable; do not change worker assignment rules outside local delivery.
  Notes: current `DeliverTask.requirements()` uses a constant `energyPerTick = 10` and `distance = 8`, which makes hauler pressure noisy for both early rooms and storage-heavy rooms.

- `EE-REMOTE-01` Remote haul saturation and reservation stabilization.
  Scope: stop remote haulers from over-claiming the same source room by tying assignment limits to reserved remote energy instead of only `lastHarvestTick`.
  Why next: it is the highest-value remote-mining slice that stays within economy-owned modules and does not require changing remote-room selection.
  Affected modules: `src/tasks/definitions/RemoteHaulTask.ts`, `src/rooms/ResourceManager.ts`, `src/tasks/definitions/RemoteHarvestTask.ts`.
  Guardrails: do not edit `RemoteStrategy` state selection or growth-stage scoring in this slice.
  Notes: `RemoteHaulTask.taskIsFull()` currently only checks harvest freshness, `requirements()` hard-codes `5` energy per tick, and assignment reserves the creep's full free capacity immediately.

## Deferred Or Shared Follow-Ups

- `EE-QUEUE-X1` Shared spawn-request contract for economy versus expansion.
  Reason deferred: any change to queue precedence across baseline requests, support/bootstrap requests, reservation requests, and future expansion requests crosses role boundaries.
  Likely modules: `src/spawner/SpawnManager.ts`, `src/spawner/SpawnRequests.ts`, `src/plans/defintions/SupportPlan.ts`, `src/plans/defintions/ReservationPlan.ts`, future expansion queue writers.
  Coordination: requires `technical-architect` before delegation.

- `EE-REMOTE-X1` Remote activation scoring and owner reassignment.
  Reason deferred: `refreshRemoteStrategies()` in `src/rooms/RemoteStrategy.ts` mixes ownership scoring with state transitions for all remotes, which is broader than the first safe remote slice.
  Likely modules: `src/rooms/RemoteStrategy.ts`, `src/rooms/RoomGrowth.ts`, `src/plans/defintions/RemoteMiningPlan.ts`.
