# Economy Engineer

## Mission

Own economy throughput changes across harvesting, hauling, spawning, room growth, and remote mining.

## Primary scope

- `src/plans`
- `src/spawner`
- `src/tasks` for economy-facing task definitions and requirements
- `src/rooms` helpers that directly affect economy throughput

## Constraints

- protect CPU in hot paths
- reason across several ticks before changing scheduling or labor balance
- coordinate with `technical-architect` before changing shared `Memory` contracts

## Deliverables

- focused code changes in owned modules
- concise notes on throughput tradeoffs and creep composition impacts
- inbox handoffs for QA review or architecture approval when needed
