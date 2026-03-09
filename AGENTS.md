# AGENTS.md

This repository is a Screeps AI written in TypeScript. Agents should optimize for safe, incremental changes that preserve in-game behavior and CPU efficiency.

## Start Here

1. Read [README.md](/Users/rafe/games/screeps/README.md).
2. Read [docs/agents/REPO_MAP.md](/Users/rafe/games/screeps/docs/agents/REPO_MAP.md).
3. Read [docs/agents/SCREEPS_PRIMER.md](/Users/rafe/games/screeps/docs/agents/SCREEPS_PRIMER.md).
4. Inspect the code you are about to change, starting from [src/main.ts](/Users/rafe/games/screeps/src/main.ts).

## Repository Intent

- The runtime is the Screeps game loop. Code is evaluated repeatedly across ticks, with persistent `Memory` and ephemeral globals.
- The main execution pipeline is:
  `loop -> World -> plans -> spawning -> task assignment -> creep actions -> persist memory`
- This repo extends the upstream `screeps-typescript-starter` with higher-level planning, task assignment, scouting, room intel, and private-server deployment.

## Agent Workflow

- Before changing behavior, trace how the relevant data flows through `Memory`, task creation, and creep action execution.
- Prefer small changes that fit the current architecture instead of introducing a parallel control system.
- Preserve path aliases and existing folder boundaries. Imports use `baseUrl: "src/"`.
- Validate with:
  `npm run build`
  `npm run test`
  `npm run lint`
- Current baseline:
  `npm run build` passes.
  `npm run test` currently fails under modern Node/Mocha due legacy TypeScript test-runner assumptions.
  `npm run lint` currently reports many pre-existing violations after the ESLint config compatibility fix.
- If changing deploy behavior, also inspect [rollup.config.js](/Users/rafe/games/screeps/rollup.config.js) and the shell wrappers [deploy](/Users/rafe/games/screeps/deploy) and [deploy_private](/Users/rafe/games/screeps/deploy_private).

## Screeps-Specific Constraints

- CPU matters. Avoid per-tick allocations, repeated global scans, and noisy logging in hot paths.
- `Memory` survives ticks. Globals do not. Module-level caches must tolerate global resets.
- Creep body design is constrained by spawn energy, move fatigue, carry throughput, and creep lifetime.
- Many bugs only show up over multiple ticks. If you change scheduling, spawning, or memory ownership, reason across several ticks, not just one call site.

## Current Commands

- `npm run build`: bundle without uploading.
- `npm run push-main`: upload using the `main` target from `screeps.json`.
- `npm run privateServer`: deploy to the local path controlled by `SCREEPS_LOCAL_PATH`.
- `npm run test`: unit tests.
- `npm run lint`: ESLint on `src/**/*.ts`.

## Secrets And Local Config

- `screeps.json` is ignored and should never be committed.
- Use [screeps.sample.json](/Users/rafe/games/screeps/screeps.sample.json) as the template for new local configs.
- The private-server deployment path defaults to the Windows Screeps client path mounted into WSL, but can be overridden with `SCREEPS_LOCAL_PATH`.

## Known Sharp Edges

- Upstream docs in `docs/` still describe the starter kit broadly; this repo contains custom game logic beyond those docs.
- Integration tests are scaffolded but not wired into the default `npm test` command.
- The unit-test harness and lint ruleset are partially out of date relative to the currently installed Node/Mocha/ESLint versions.
- If you touch `Memory` schemas, update the ambient interfaces in [src/main.ts](/Users/rafe/games/screeps/src/main.ts) and any default-memory helpers.
