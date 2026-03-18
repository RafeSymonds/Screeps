# Project Overview

This repository is a custom Screeps AI that replaces the empty logic of the upstream starter kit with a persistent, CPU-aware tick loop.

## Core Tick Pipeline

The AI runs a structured pipeline every tick:

1. **Memory Bootstrap**: Rehydrating persistent task and world state.
2. **World View Building**: Normalizing room and creep state into a shared world model.
3. **CPU-Aware Planning**: Strategizing economy, defense, growth, and exploration. Plans are skipped when CPU bucket is low.
4. **Task Assignment**: Matching live creeps to rehydrated or newly created tasks.
5. **Action Execution**: Towers and creeps execute their assigned work.
6. **Memory Persistence**: Saving the updated state for the next tick.

For more details on these subsystems, see the [Repo Map](../agents/REPO_MAP.md).

## Common Development Commands

- `npm run build`: Bundles the project without uploading.
- `npm run privateServer`: The standard baseline check for local development. Deploys code to a path specified in `screeps.json`.
- `npm run test`: Runs unit tests (check `AGENTS.md` for current status).
- `npm run lint`: Runs ESLint on `src/**/*.ts`.
- `npm run push-main`: Deploys to the "main" target in `screeps.json`.

## Multi-Agent Operations

If you are using the headless agent runner, use these commands:

- `npm run agent:roles`: List all available agent roles.
- `npm run agent:queue`: Refresh the task queue.
- `npm run agent:process`: Rehearse the next tasks in the queue (dry-run).

For more on this workflow, see the [Agent Workflow](../agent-workflow.md) guide.
