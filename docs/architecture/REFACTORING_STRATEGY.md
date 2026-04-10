# Screeps AI Refactoring Strategy

## Context

The Screeps AI codebase has accumulated significant technical debt. The system was built incrementally without a unified architectural vision, and the result is:

- Inconsistent code conventions across files
- Blurred boundaries between subsystems
- Global memory schema sprawling across `src/main.ts`
- Spawn logic doing too many things at once
- Plans with no standardized output contract

This document outlines a phased strategy to stabilize, clean, and eventually simplify the codebase.

---

## Goals

1. **Zero lint errors** — 456 warnings/errors currently. Target: clean build.
2. **Clear subsystem boundaries** — Every module should have a single, documented responsibility.
3. **Explicit memory contracts** — Memory schemas live in a dedicated `src/memory/` folder, not `main.ts`.
4. **Testable logic** — Spawn heuristics, plan outputs, and task assignment should be unit-testable without running the game.
5. **Reduced plan count** — 15 plans with inconsistent patterns should be consolidated to ~10 with standardized interfaces.

---

## Evaluation Criteria

Each phase is "done" when:

| Phase   | Criterion                                                                             |
| ------- | ------------------------------------------------------------------------------------- |
| Phase 1 | `npm run lint` reports 0 errors                                                       |
| Phase 2 | `npm run build` + all unit tests pass                                                 |
| Phase 3 | No ambient `Memory` interfaces in `main.ts`; all schemas in `src/memory/`             |
| Phase 4 | SpawnManager split into 3 files with no shared state                                  |
| Phase 5 | `src/actions/` contains 0 classes; replaced by pure functions or stateless interfaces |
| Phase 6 | Plan count reduced from 15 to 10; all plans use `PlanOutput`                          |
| Final   | `npm run lint && npm run build && npm run test` all pass in CI                        |

---

## Phase 1: Lint Debt Elimination

### Problem

456 lint warnings/errors across the codebase. Primary categories:

- **sort-imports**: Imports not sorted alphabetically; "multiple" syntax before "single" syntax
- **@typescript-eslint/explicit-member-accessibility**: Class properties and constructors missing `public`/`private`
- **@typescript-eslint/no-unsafe-argument**: `any` types being passed where specific types expected
- **@typescript-eslint/no-unused-vars**: Unused variables and imports

### Actions

1. Add `"type": "module"` to `package.json` to eliminate the MODULE_TYPELESS_PACKAGE_JSON warning in build output
2. Run `npm run lint:fix` to auto-fix import sorting and accessibility modifiers
3. Manually fix unsafe argument errors in `AttackAction.ts` (lines 134, 137)
4. Remove unused `creepStoreFullPercentage` from `CollectionAction.ts`
5. Audit remaining errors, fix in bulk

### Owner

`systems-engineer` + `qa-reviewer`

---

## Phase 2: Memory Schema Consolidation

### Problem

`src/main.ts` contains 185 lines of ambient `global` interface declarations. This creates:

- No migration layer when schemas change
- No clear ownership of memory contracts
- Tests cannot mock memory without importing `main.ts`

### Actions

1. Create `src/memory/` directory
2. Move all `Memory`, `CreepMemory`, `RoomMemory`, `RoomTopology`, `RoomIntel`, `RoomSpawnStats`, `RoomDefenseState`, `RoomSpawnRequest`, `RemoteMiningData`, `RemoteRoomStrategy`, `RoomGrowthState`, `RoomSupportRequest`, `RoomOnboardingState` interfaces to `src/memory/types.ts`
3. Create `src/memory/migrations.ts` with a `runMigrations()` function that handles version upgrades
4. Add `Memory.version` field to track schema version
5. In `main.ts`, import types from `src/memory/types.ts` and call `runMigrations()` at tick start
6. Deprecate inline ambient declarations in `main.ts` — they should re-export from `src/memory/types.ts`

### New File Structure

```
src/memory/
  types.ts          # All Memory interface definitions
  migrations.ts      # Version-based cleanup and bridge logic
  index.ts           # Re-exports for convenience
```

### Migration Path

For this phase, existing data is "Safe to Reset" since we're just moving interfaces, not changing types. Add a one-time cleanup in `runMigrations()` that deletes any orphaned keys from previously-deleted features (future work).

### Owner

`technical-architect` + `qa-reviewer`

---

## Phase 3: Action System Rewrite

### Problem

`src/actions/` contains 14 classes (e.g., `HarvestAction`, `BuildAction`, `MoveAction`) that:

- Are instantiated per-creep per-tick with no caching
- Use class syntax but behave as stateless utility functions
- Inconsistent use of constructor parameters vs class properties
- Forces `public` modifier on methods that don't need it

The `Action` base class is an abstract class with a single `perform(creepState: CreepState): void` method — but there's no state to preserve between ticks, so the class hierarchy adds overhead without benefit.

### Actions

1. Replace `Action` class hierarchy with pure functions in `src/actions/`:
    - `harvest(creepState: CreepState, target: Source | Mineral): ScreepsReturnCode`
    - `build(creepState: CreepState, target: ConstructionSite): ScreepsReturnCode`
    - `upgrade(creepState: CreepState, target: StructureController): ScreepsReturnCode`
    - etc.

2. Each function signature should match Screeps native return types (`ScreepsReturnCode`)

3. Delete `src/actions/Action.ts` base class

4. Update all tasks in `src/tasks/definitions/` to use the new function-based actions

5. Update `src/creeps/CreepActions.ts` to call functions directly instead of instantiating action objects

### Rationale

Pure functions are:

- Easier to test (no object construction needed)
- Zero memory allocation per tick
- Explicit about dependencies (parameters passed in, not captured in `this`)
- Consistent with functional composition patterns

### Owner

`technical-architect`

---

## Phase 4: SpawnManager Refactor

### Problem

`src/spawner/SpawnManager.ts` is 1138 lines doing:

1. **Creep classification** (isMiner, isWorker, isScout, etc.)
2. **Supply/demand math** (deriveSupply, deriveDemand, pressure scores)
3. **Body builders** (minerBody, haulerBody, workerBody, defenderBody, etc.)
4. **Spawn decision** (selectSpawnIntent, explicitSpawnRequests, baseline generation)

These concerns are independent and should be separated.

### Actions

1. Extract creep classification to `src/spawner/CreepClassifier.ts`:

    ```typescript
    export interface CreepProfile {
        role: "miner" | "hauler" | "worker" | "scout" | "defender" | "claimer" | "attacker";
        body: BodyPartConstant[];
        isExpiringSoon: boolean;
    }
    export function classifyCreep(creep: CreepState): CreepProfile | null;
    ```

2. Extract spawn body builders to `src/spawner/BodyBuilders.ts`:

    ```typescript
    export interface BodyBuildResult {
        body: BodyPartConstant[];
        cost: number;
    }
    export function buildScout(energy: number): BodyBuildResult;
    export function buildMiner(energy: number, room?: Room): BodyBuildResult;
    export function buildHauler(energy: number, room: Room, routeLength?: number): BodyBuildResult;
    export function buildWorker(energy: number): BodyBuildResult;
    export function buildDefender(energy: number): BodyBuildResult;
    export function buildClaimer(energy: number): BodyBuildResult;
    export function buildAttacker(energy: number): BodyBuildResult;
    ```

3. Extract demand calculation to `src/spawner/CreepDemand.ts`:

    ```typescript
    export interface DemandSnapshot {
        mine: { parts: number; creeps: number };
        carry: { parts: number; creeps: number };
        work: { parts: number; creeps: number };
        combat: { parts: number; creeps: number };
        scout: { creeps: number };
    }
    export function calculateDemand(tasks: AnyTask[], room: Room): DemandSnapshot;
    export function calculateSupply(worldRoom: WorldRoom): SupplySnapshot;
    export function pressureScore(supply: SupplySnapshot, demand: DemandSnapshot): PressureSnapshot;
    ```

4. Refactor `SpawnManager.ts` to orchestrate:

    ```typescript
    // Uses the extracted modules; owns only spawn timing and room iteration
    export class SpawnManager {
      public run(world: World): void { ... }
      private spawnForRoom(worldRoom: WorldRoom): void { ... }
      private selectSpawnIntent(...): SpawnIntent | null
    }
    ```

5. Move `SpawnRequestRole`, `SpawnRequestPriority`, `SpawnRequests` logic to `src/spawner/SpawnRequests.ts` if not already separate

### File Structure After Refactor

```
src/spawner/
  SpawnManager.ts      # Orchestration only
  CreepClassifier.ts  # Role detection
  BodyBuilders.ts     # Body composition
  CreepDemand.ts      # Supply/demand math
  SpawnRequests.ts    # Priority + queue management
```

### Owner

`economy-engineer` + `technical-architect`

---

## Phase 5: Plan Consolidation

### Problem

15 plans with inconsistent patterns:

- Some create tasks only
- Some write to room memory only
- Some do both
- No standardized output type

### Current Plan List (from `PlanManager.ts`)

1. DefensePlan (interval: 1, critical)
2. EconomyPlan (interval: 5, important)
3. LinkPlan (interval: 1, critical)
4. GrowthPlan (interval: 25, important)
5. SupportPlan (interval: 10, important)
6. MaintenancePlan (interval: 10, important)
7. InfrastructurePlan (interval: 25, important)
8. BasePlan (interval: 50, optional)
9. RemoteMiningPlan (interval: 10, important)
10. ScoutingPlan (interval: 15, optional)
11. ExpansionPlan (interval: 50, optional)
12. TerminalPlan (interval: 15, important)
13. ReservationPlan (interval: 20, important)
14. AttackPlan (interval: 25, optional)

### Proposed Consolidation

| Before                     | After                               | Rationale                                                                                 |
| -------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| GrowthPlan + ExpansionPlan | ExpansionPlan (merged)              | Both deal with room expansion; GrowthPlan sets targets for ExpansionPlan                  |
| MaintenancePlan            | Absorbed into InfrastructurePlan    | Maintenance is a subset of infrastructure; 10-tick interval doesn't justify separate pass |
| LinkPlan                   | Absorbed into EconomyPlan           | Link energy transfer is a type of economy task                                            |
| ReservationPlan            | Absorbed into AttackPlan or removed | Reservations are for attack support; belongs in military planning                         |
| TerminalPlan               | Standalone (keep)                   | Market operations are distinct enough                                                     |

### Proposed Plan Interface

```typescript
export interface PlanOutput {
    tasks?: TaskData[]; // New or updated tasks
    roomMemory?: Partial<RoomMemory>; // Room memory writes
    spawnRequests?: RoomSpawnRequest[]; // Explicit spawn requests
}

export abstract class Plan {
    abstract run(world: World): PlanOutput;
    abstract get interval(): number;
    abstract get priority(): PlanPriority;
}
```

All plans return `PlanOutput`; `PlanManager` applies writes to `TaskManager` and `RoomMemory`.

### Owner

`technical-architect` + `operations-engineer`

---

## Phase 6: Task System Simplification

### Problem

Current task system has complexity issues:

1. `TaskManager` holds `Map<string, AnyTask>` and persists to `Memory.tasks`
2. `Task` base class has both data (`data: T`) and methods (`canAcceptCreep`, `assignmentScore`, `nextAction`)
3. Tasks are rehydrated via `createTask(data: TaskData)` switch statement in `TaskCreation.ts`
4. Creep memory holds `taskId` as the link, but there's no transactional guarantee if task assignment fails

### Actions

1. Evaluate whether `Task` can be split into:
    - `TaskData`: pure persisted state (what goes into `Memory.tasks`)
    - `TaskLogic`: purely functional `nextAction()` and `requirements()` implementations

2. Consider renaming `TaskRequirements` to something more descriptive (e.g., `LaborDemand`)

3. Simplify `TaskAssignment` to iterate tasks and assign creeps in one pass without complex scoring

4. Add integration test that rehydrates tasks from a serialized `Memory.tasks` snapshot and verifies:
    - All tasks rehydrate without errors
    - `nextAction()` returns non-null for active tasks
    - `requirements()` returns valid labor demands

### Owner

`technical-architect` + `economy-engineer`

---

## Implementation Order

```
Phase 1 (Lint) ─────────────────────────────────────────────┐
                                                           │
Phase 2 (Memory) ────────────────┐                         │
                                 │                         │
Phase 3 (Actions) ───────────────┼── These 3 can run in    │
                                 │   parallel after        │
Phase 4 (SpawnManager) ──────────┘   Phase 1 is done      │
                                                           │
Phase 5 (Plans) ───────────────────────────────────────────┤
                                                           │
Phase 6 (Tasks) ───────────────────────────────────────────┘
```

**Dependencies**:

- Phase 2 must complete before Phase 3 (memory types needed for action signatures)
- Phase 4 depends on Phase 2 (clean type references)
- Phase 5 depends on Phase 3 (actions used in plan output)
- Phase 6 depends on all previous phases

---

## Risk Mitigation

| Risk                                       | Mitigation                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| Breaking in-game behavior during refactor  | Each phase includes in-game validation; test on private server before merging |
| Memory schema changes losing active tasks  | Phase 2 includes bridge logic; `TaskManager` validates rehydration            |
| Spawn changes causing economic collapse    | Phase 4 includes pressure score regression tests                              |
| Plan consolidation breaking task creation  | Phase 5 includes task count audit before/after                                |
| Multi-agent conflicts during parallel work | Respect ownership boundaries; Phase 1 and 2 are serial                        |

---

## Open Questions

1. **Actions as pure functions vs stateful classes**: Is there any action that genuinely needs to preserve state between ticks? If so, which ones and why?
2. **Plan output contract**: Should plans be allowed to write directly to `RoomMemory` or should everything flow through task creation?
3. **Task vs room-memory for cross-plan signaling**: Currently plans use `RoomMemory.growth`, `RoomMemory.supportRequest` etc. to signal. Should this be replaced with task-based communication?
4. **Creep role classification**: Is the current body-part-based classification correct, or should roles be derived from `CreepMemory.lastTaskKind`?
5. **Memory version reset**: Should we require a one-time reset of Memory to clean up orphaned keys, or maintain bridges indefinitely?
