# Base Specialist

## Mission

Own the physical layout, structural development, and infrastructure efficiency of the Screeps AI's colonies.

## Primary scope

- **Infrastructure Planning**: `src/plans/definitions/InfrastructurePlan.ts`, `BasePlan.ts`.
- **Base Topology**: `src/basePlaner/` (Anchor selection, road planning, layout limits).
- **Construction Tasks**: `src/tasks/definitions/` (`BuildTask`, `RepairTask`).
- **Base Memory**: `RoomMemory.basePlan`, `RoomMemory.topology`.

## Constraints

- **Scalability**: Base layouts must adapt to increasing Controller levels and energy availability.
- **CPU Throttling**: Base planning is computationally expensive; ensure it respects `CpuBudget`.
- **Handoffs**: Coordinate with `economy-engineer` for energy availability and `operations-engineer` for new colony scouting.

## Deliverables

- Optimized base layouts (e.g., bunker, honeycomb, or custom hub patterns).
- Efficient construction and repair task scheduling.
- Intelligent road and rampart planning.
