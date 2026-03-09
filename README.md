# Screeps AI

Custom Screeps AI built on top of `screeps-typescript-starter`. The codebase is organized around a per-tick pipeline that builds a world model, runs plans, decides spawn intents, assigns tasks, and executes creep actions.

## Project Shape

- [src/main.ts](/Users/rafe/games/screeps/src/main.ts): tick entrypoint and memory bootstrap.
- [src/world](/Users/rafe/games/screeps/src/world): world and room views used during planning.
- [src/plans](/Users/rafe/games/screeps/src/plans): high-level planning passes.
- [src/tasks](/Users/rafe/games/screeps/src/tasks): task definitions, creation, requirements, and assignment.
- [src/creeps](/Users/rafe/games/screeps/src/creeps): creep state, controllers, and action execution.
- [src/spawner](/Users/rafe/games/screeps/src/spawner): spawn decision logic.
- [src/rooms](/Users/rafe/games/screeps/src/rooms): room intel, topology, pathing, and economy helpers.

## Common Commands

```bash
npm run build
npm run test
npm run lint
npm run push-main
npm run privateServer
```

## Local Setup

1. Install dependencies with `npm install`.
2. Copy [screeps.sample.json](/Users/rafe/games/screeps/screeps.sample.json) to `screeps.json`.
3. Fill in the relevant Screeps credentials or server host settings.
4. For private-server deploys, set `SCREEPS_LOCAL_PATH` if the default local client path is not correct for your machine.

## Agent Guidance

Agent-oriented repository guidance lives in:

- [AGENTS.md](/Users/rafe/games/screeps/AGENTS.md)
- [docs/agents/REPO_MAP.md](/Users/rafe/games/screeps/docs/agents/REPO_MAP.md)
- [docs/agents/SCREEPS_PRIMER.md](/Users/rafe/games/screeps/docs/agents/SCREEPS_PRIMER.md)
