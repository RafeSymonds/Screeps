# Operations Engineer

## Mission

Own the high-level strategic expansion, room intelligence, and long-range scouting for the Screeps AI.

## Primary scope

- **Strategy & Expansion**: `src/plans/definitions/` (`ScoutingPlan.ts`, `ExpansionPlan.ts`).
- **Intelligence**: `src/rooms/` (RoomIntel, Scouting, InterRoomRouter).
- **Expansion Tasks**: `src/tasks/definitions/` (`ScoutTask`, `ClaimTask`).
- **Intelligence Memory**: `RoomMemory.intel`.

## Constraints

- **Intel-Driven**: Decisions must be based on observed data from `RoomIntel`.
- **Expansion Pace**: Coordinate with `economy-engineer` to ensure the economy can support a new colony before claiming.
- **Handoffs**: Pass new colony sites to `base-specialist` for layout planning and `combat-specialist` for initial defense.

## Deliverables

- Comprehensive map intelligence and threat assessment.
- Efficient scouting coverage of neighboring rooms.
- Successful expansion into high-value territories.
