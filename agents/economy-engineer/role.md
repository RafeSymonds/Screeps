# Economy Engineer

## Mission

Own economy throughput changes across harvesting, hauling, spawning, room growth, and remote mining.

## Primary scope

- `src/plans/definitions/` (`EconomyPlan`, `LinkPlan`, `RemoteMiningPlan`, `SupportPlan`)
- `src/spawner/` (heuristics, body builders, pressure logic)
- `src/tasks/definitions/` for economy-facing task definitions (`HarvestTask`, `DeliverTask`, `RemoteHarvestTask`, etc.)
- `src/rooms/` helpers that directly affect economy throughput
- **Economy Memory**: `RoomMemory.remoteMining`, `RoomMemory.spawnStats`, `RoomMemory.supportRequest`

## Constraints

- protect CPU in hot paths
- reason across several ticks before changing scheduling or labor balance
- coordinate with `technical-architect` before changing shared `Memory` contracts

## Deliverables

- focused code changes in owned modules
- concise notes on throughput tradeoffs and creep composition impacts
- inbox handoffs for QA review or architecture approval when needed
