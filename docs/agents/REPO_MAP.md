# Repo Map

## Tick Flow

The active runtime starts in [src/main.ts](/Users/rafe/games/screeps/src/main.ts):

1. Bootstrap `Memory`.
2. Rehydrate tasks from `Memory.tasks` through `TaskManager`.
3. Remove dead creeps from memory and task assignments.
4. Wrap live creeps in `CreepState`.
5. Build `World`, which creates `WorldRoom` instances and a `ResourceManager`.
6. Run plans in order:
   `EconomyPlan`, `BasePlan`, `RemoteMiningPlan`, `ScoutingPlan`.
7. Run `SpawnManager`.
8. Assign creeps to tasks.
9. Execute creep actions.
10. Persist creep and task data back to memory.

## Main Subsystems

### `src/world`

- `World.ts`: shared per-tick world object.
- `WorldRoom.ts`: room-scoped view of owned creeps and room state.

### `src/plans`

- `core/PlanManager.ts`: plan ordering.
- `definitions/*`: strategic planning passes that create or update tasks and room intent.

### `src/tasks`

- `definitions/*`: domain tasks such as harvest, build, upgrade, remote harvest, hauling, scouting.
- `core/TaskManager.ts`: task rehydration and lookup.
- `core/TaskAssignment.ts`: greedy assignment of free creeps to viable tasks.
- `core/TaskRequirements.ts`: abstract labor requirements used by spawning and planning.

### `src/creeps`

- `CreepState.ts`: wrapper around live creep plus derived state.
- `CreepController.ts`: task memory and preemption helpers.
- `CreepActions.ts`: per-tick execution of assigned work.

### `src/spawner`

- `SpawnManager.ts`: derives labor supply vs demand and chooses spawn intents.
- Current role model is capability-based, not string-role-based. Classification comes from body parts.

### `src/rooms`

- Room intel, scouting, topology, pathfinding, resource accounting, and remote mining support.

## Important Data Contracts

- `Memory.tasks` is the canonical persisted task list.
- `Memory.creeps[name]` stores assignment and work-state metadata.
- `RoomMemory` is extended with topology, intel, base, and remote mining fields.
- Ambient interfaces for `Memory`, `CreepMemory`, `RoomMemory`, and related custom types live in [src/main.ts](/Users/rafe/games/screeps/src/main.ts).

## Change Guidance

- If you add a task type, update task definitions, task creation, assignment compatibility, and any spawn-demand implications.
- If you add room intelligence, update both persistent types and any default memory initializers.
- If you change spawn heuristics, verify the effect on miners, haulers, and workers together. The current spawn manager balances supply against task demand and hauling throughput.
