# Screeps AI

Custom Screeps AI built on top of `screeps-typescript-starter`. The active codebase is no longer a generic starter layout: it runs a persistent per-tick control loop that rehydrates task state from `Memory`, builds a world model, schedules CPU-aware planning passes, decides spawn intents, assigns labor, executes tower and creep actions, and writes state back to `Memory`.

## Project Shape

- [src/main.ts](/Users/rafe/games/screeps/src/main.ts): tick entrypoint and memory bootstrap.
- [src/world](/Users/rafe/games/screeps/src/world): world and room views used during planning.
- [src/plans](/Users/rafe/games/screeps/src/plans): CPU-throttled planning passes for defense, economy, growth, remotes, support, expansion, and attack.
- [src/tasks](/Users/rafe/games/screeps/src/tasks): task definitions, creation, requirements, and assignment.
- [src/creeps](/Users/rafe/games/screeps/src/creeps): creep state, controllers, and action execution.
- [src/spawner](/Users/rafe/games/screeps/src/spawner): spawn decision logic.
- [src/rooms](/Users/rafe/games/screeps/src/rooms): room intel, topology, support, growth, pathing, and economy helpers.
- [src/combat](/Users/rafe/games/screeps/src/combat): tower targeting and combat support utilities.
- [src/cpu](/Users/rafe/games/screeps/src/cpu): bucket-aware throttling and pixel generation rules.

## Tick Pipeline

The main loop in [src/main.ts](/Users/rafe/games/screeps/src/main.ts) runs in this order:

1. Clear stale cached paths.
2. Bootstrap top-level `Memory` collections.
3. Rehydrate tasks through `TaskManager`.
4. Remove dead creeps from `Memory` and task assignments.
5. Normalize creep memory and wrap live creeps in `CreepState`.
6. Build `World`, `WorldRoom`, and `ResourceManager`.
7. Run CPU-aware plans through `PlanManager`.
8. Prune invalid tasks.
9. Run `SpawnManager`.
10. Assign creeps to tasks.
11. Run tower defense and repairs.
12. Execute creep actions.
13. Persist creep and task data back to `Memory`.
14. Update CPU averages and opportunistically generate pixels when the bucket is high.

## Common Commands

```bash
npm run build
npm run test
npm run lint
npm run push-main
npm run push-pserver
npm run push-season
npm run push-sim
npm run privateServer
npm run watch-main
npm run watch-pserver
npm run watch-season
npm run watch-sim
npm run agent:roles
npm run agent:queue
npm run agent:process
```

## Local Setup

1. Install dependencies with `npm install`.
2. Copy [screeps.sample.json](/Users/rafe/games/screeps/screeps.sample.json) to `screeps.json`.
3. Fill in the relevant Screeps credentials or server host settings.
4. For private-server deploys, set `SCREEPS_LOCAL_PATH` if the default local client path is not correct for your machine.

## Validation Notes

- `npm run build` is the current reliable baseline check.
- `npm run test` runs both unit and integration suites via the TypeScript test build.
- `npm run lint` targets `src/**/*.ts`.
- Some agent docs call out known failures or pre-existing lint debt; check [AGENTS.md](/Users/rafe/games/screeps/AGENTS.md) before treating those as regressions.

## Agent Guidance

This project uses a durable multi-agent workflow for development and maintenance. For onboarding and architectural guidance, see:

- [AGENTS.md](/Users/rafe/games/screeps/AGENTS.md): The "Start Here" guide for all agents and contributors.
- [docs/agent-workflow.md](/Users/rafe/games/screeps/docs/agent-workflow.md): Comprehensive guide to roles, session state, and queue resolution.
- [docs/agents/REPO_MAP.md](/Users/rafe/games/screeps/docs/agents/REPO_MAP.md): Technical overview of the tick pipeline and codebase subsystems.
- [docs/agents/SCREEPS_PRIMER.md](/Users/rafe/games/screeps/docs/agents/SCREEPS_PRIMER.md): Summary of Screeps game rules and their impact on this AI.
- [agents/README.md](/Users/rafe/games/screeps/agents/README.md): Quick reference for the `agents/` workspace.
