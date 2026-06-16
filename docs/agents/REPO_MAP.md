# Repo Map

## Tick Flow

The active runtime starts in [src/main.ts](/Users/rafe/games/screeps/src/main.ts):

1. Clear stale path cache entries.
2. Bootstrap top-level `Memory` collections.
3. Rehydrate tasks from `Memory.tasks` through `TaskManager`.
4. Remove dead creeps from memory and task assignments.
5. Normalize live creep memory and wrap creeps in `CreepState`.
6. Build `World`, which creates `WorldRoom` instances and a `ResourceManager`.
7. Run plans through `PlanManager`, subject to CPU bucket throttling.
8. Prune invalid tasks after planning.
9. Run `SpawnManager`.
10. Assign creeps to tasks.
11. Run tower defense, healing, and repair logic.
12. Execute creep actions.
13. Persist creep and task data back to memory.
14. Update CPU averages and generate pixels when the bucket is high enough.

### Plan Order

`PlanManager` currently schedules these plans in this order:

1. `DefensePlan`
2. `EconomyPlan`
3. `LinkPlan`
4. `SupportPlan`
5. `InfrastructurePlan`
6. `BasePlan`
7. `RemoteMiningPlan`
8. `ScoutingPlan`
9. `ExpansionPlan` (also drives room growth via `updateRoomGrowth` — there is no separate `GrowthPlan`)
10. `TerminalPlan`
11. `ObserverPlan`
12. `AttackPlan` (also handles remote reservation — `ReservationPlan` was merged in)

Important nuance:

- Plans do not all run every tick. `src/cpu/CpuBudget.ts` and `src/plans/core/PlanScheduler.ts` stretch or skip non-critical plans based on `Game.cpu.bucket`.
- `Memory.planRuns` is part of the scheduling contract. If plan cadence changes, update the docs and consider migration implications.

## Main Subsystems

### `src/world`

- `World.ts`: shared per-tick world object.
- `WorldRoom.ts`: room-scoped view of owned creeps, structures, hostiles, and room state.

### `src/plans`

- `core/PlanManager.ts`: plan ordering and CPU-aware execution.
- `core/PlanScheduler.ts`: interval scheduling keyed by `Memory.planRuns`.
- `definitions/*`: strategic planning passes that create or update tasks and room intent.

### `src/tasks`

- `definitions/*`: domain tasks such as harvest, build, upgrade, remote harvest, hauling, scouting.
- `core/TaskManager.ts`: task rehydration and lookup.
- `core/TaskAssignment.ts`: greedy assignment of free creeps to viable tasks. **Assignment is purely capability-based** — a creep is paired with any task whose `canPerformTask` (does the body have the required parts) and `canAcceptCreep` (is there a free slot) both pass, ranked by `assignmentScore`. There is no role gate, and `CreepMemory` carries no behavioral role. Any creep does any task its body can perform.
- `core/TaskRequirements.ts`: abstract labor requirements used by spawning and planning.

### `src/creeps`

- `CreepState.ts`: wrapper around live creep plus derived state.
- `CreepController.ts`: task memory and preemption helpers.
- `CreepActions.ts`: per-tick execution of assigned work.

### `src/spawner`

- `SpawnManager.ts`: derives labor supply vs demand and chooses spawn intents.
- **"Role" here is a spawn-side concept only** (`SpawnRequestRole`): it selects a *body template* and a *population target*. It does **not** gate behavior — task assignment is capability-based (see `src/tasks`).
- Population is counted off the **persisted `CreepMemory.spawnRole` tag** (set at spawn time), not re-derived from body shape. This is required because several roles share identical bodies — `hauler`/`hubHauler`/`fastFiller` are all `[CARRY, MOVE]`, and `worker`/`mineralHarvester` are both `[WORK, CARRY, MOVE]` — so body parts cannot distinguish them. Legacy/untagged creeps fall back to a body-shape heuristic (`bodyFallbackRole`).
- The tag is a stable identity: it must survive task resets (`getDefaultCreepMemory` preserves it), or counts would drift every time a creep finishes a task.
- Spawn requests also flow through `src/spawner/SpawnRequests.ts` via room memory.

### `src/rooms`

- Room intel, scouting, topology, pathfinding, resource accounting, and remote mining support.

### `src/combat`

- `TowerDefense.ts`: tower attack, heal, repair, and fortification behavior.

### `src/cpu`

- `CpuBudget.ts`: CPU bucket tiers, plan throttling, and pixel generation.

## Important Data Contracts

- `Memory.tasks` is the canonical persisted task list.
- `Memory.planRuns` stores per-plan scheduling timestamps.
- `Memory.creeps[name]` stores assignment and work-state metadata.
- `RoomMemory` is extended with topology, intel, base, and remote mining fields.
- Ambient interfaces for `Memory`, `CreepMemory`, `RoomMemory`, and related custom types live in [src/main.ts](/Users/rafe/games/screeps/src/main.ts).

## Change Guidance

- If you add a task type, update task definitions, task creation, assignment compatibility, and any spawn-demand implications.
- If you add room intelligence, update both persistent types and any default memory initializers.
- If you change plan cadence or priorities, verify the effect on `Memory.planRuns`, CPU bucket behavior, and any logic that assumes fresh room intel.
- If you change spawn heuristics, verify the effect on miners, haulers, workers, and request-driven special creeps together. The current spawn manager balances supply against task demand, hauling throughput, and explicit room spawn requests.
