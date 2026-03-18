# Economy Decomposition Plan

This document outlines the architectural boundaries for the Screeps AI economy subsystems, identifying which areas can be developed independently and which require serialized coordination.

## Independent Modules (Low Conflict)

These modules can be edited by different agents (or the same agent in parallel branches) with minimal risk of breaking each other, provided their task-level interfaces remain stable.

### 1. Task Definitions (`src/tasks/definitions/`)
- **Modules**: `HarvestTask`, `DeliverTask`, `UpgradeTask`, `BuildTask`, `RemoteHarvestTask`, `RemoteHaulTask`.
- **Independence**: Each task defines its own `requirements()` and `run()` logic.
- **Coordination**: Only required if changing the `TaskRequirements` interface itself (owned by `technical-architect`).

### 2. Strategy Planners (`src/plans/definitions/`)
- **Modules**: `EconomyPlan`, `RemoteMiningPlan`, `GrowthPlan`.
- **Independence**: These are high-level "brain" passes that create tasks. They read from `World` and `Memory` but mostly write to the `TaskManager`.
- **Coordination**: Minimal. As long as they don't fight over the same `Memory` keys (e.g., both trying to set `RoomMemory.growth`), they are safe to evolve separately.

### 3. Room Intelligence Helpers (`src/rooms/`)
- **Modules**: `RoomGrowth.ts`, `RemoteStrategy.ts`, `RemoteMiningData.ts`.
- **Independence**: Pure logic that processes data and returns decisions.
- **Coordination**: Ensure stable schemas for `RoomMemory` fields.

## Serialized Modules (High Conflict)

Changes to these files have global ripple effects and MUST be treated as serialized, high-risk work.

### 1. The Core Loop (`src/main.ts`)
- **Risk**: Controls tick order and top-level `Memory` bootstrapping.
- **Ownership**: `technical-architect`.

### 2. Spawn Balancing (`src/spawner/SpawnManager.ts`)
- **Risk**: This is the central bottleneck. It aggregates demand from ALL tasks to calculate "pressure."
- **Conflict**: Any change to `PRESSURE_ALPHA`, `TASK_CARRY_WEIGHT`, or body builders affects the economy's stability globally.
- **Ownership**: `economy-engineer` (heuristics) + `technical-architect` (assignment integration).

### 3. Task Management (`src/tasks/core/`)
- **Risk**: `TaskManager` and `TaskAssignment` control how creeps get their jobs.
- **Ownership**: `technical-architect`.

---

## Action Plan for Economy Engineer

To unblock parallel work, the economy-facing tasks should be decomposed into these four streams:

### Stream A: Spawn & Body Heuristics (Serialized)
*Focus: Efficiency of the spawn pipeline.*
- Tune `SpawnManager.ts` pressure coefficients.
- Refactor body builders to be more energy-tier aware.
- Balance the ratio between `WORKER` and `HAULER` demand.

### Stream B: Remote Mining Expansion (Independent)
*Focus: Strategic source acquisition.*
- Refactor `RemoteMiningPlan.ts` to use better `RemoteStrategy` metrics.
- Improve source selection in `RemoteMiningData.ts`.
- Coordinate with `operations-engineer` on scouting data freshness.

### Stream C: Hauling & Throughput (Independent)
*Focus: Solving the "starvation" problem.*
- Optimize `RemoteHaulTask.ts` requirements calculation.
- Refactor `SpawnManager.haulingFromMining` to account for route-specific friction.
- Implement link-aware hauling in `DeliverTask.ts`.

### Stream D: Room Growth Stages (Semi-Independent)
*Focus: Transitioning from bootstrap to surplus.*
- Refine `updateRoomGrowth` in `src/rooms/RoomGrowth.ts`.
- Adjust `EconomyPlan.ts` to throttle `UpgradeTask` demand when pressure is high.
- Improve `BootstrapTask` (in `src/tasks/definitions/`) for new expansions.
