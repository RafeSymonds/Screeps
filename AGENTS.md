# AGENTS.md

This repository is a Screeps AI written in TypeScript. Agents should optimize for safe, incremental changes that preserve in-game behavior and CPU efficiency.

## Start Here

1. Read [README.md](/Users/rafe/games/screeps/README.md).
2. Read [docs/agent-workflow.md](/Users/rafe/games/screeps/docs/agent-workflow.md).
3. Review the [Shared Review Checklist](/Users/rafe/games/screeps/docs/qa/REVIEW_CHECKLIST.md) (or the lightweight [Regression Checklist](/Users/rafe/games/screeps/docs/qa/REGRESSION_CHECKLIST.md) for economy/memory changes) for risky changes.
4. Read [docs/agents/REPO_MAP.md](/Users/rafe/games/screeps/docs/agents/REPO_MAP.md).
5. Read [docs/architecture/ECONOMY_DECOMPOSITION.md](/Users/rafe/games/screeps/docs/architecture/ECONOMY_DECOMPOSITION.md) for economy-facing task boundaries.
6. Read [docs/agents/SCREEPS_PRIMER.md](/Users/rafe/games/screeps/docs/agents/SCREEPS_PRIMER.md).
7. Inspect the code you are about to change, starting from [src/main.ts](/Users/rafe/games/screeps/src/main.ts).

## Repository Intent

- The runtime is the Screeps game loop. Code is evaluated repeatedly across ticks, with persistent `Memory` and ephemeral globals.
- The main execution pipeline is:
  `loop -> task rehydration -> World -> CPU-aware plans -> task pruning -> spawning -> task assignment -> tower actions -> creep actions -> persist memory`
- This repo extends the upstream `screeps-typescript-starter` with higher-level planning, CPU throttling, task assignment, scouting, room intel, combat automation, and private-server deployment.

## Architectural Guardrails

- **Architectural Guardrails**: This repo uses Architectural Ownership and Escalation rules. Changes to `Memory` schemas MUST follow the [Memory Migration Rules](/docs/qa/MEMORY_MIGRATIONS.md).
- **Ownership**: Each role (technical-architect, economy-engineer, operations-engineer, combat-specialist, base-specialist, systems-engineer) owns specific file paths and `Memory` keys. Check `docs/agent-workflow.md` for the current ownership map.
- **Escalation**: Any change to `Memory` schemas in `src/main.ts` or plan scheduling in `src/plans/core/` **MUST** be reviewed by the `technical-architect`.
- **Throttling Awareness**: Code must tolerate "missing" or "stale" state in `RoomMemory` since plans are CPU-throttled and may be skipped.
- **Task-Driven Demand**: `SpawnManager` derives demand from the current task list. If your plan adds tasks, you are responsible for the spawn pressure impact.

## Workflow Summary
- Current baseline:
  `npm run build` passes.
  `npm run test` currently fails under the repo's legacy TypeScript/Mocha harness assumptions.
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
- `npm run test`: unit and integration tests.
- `npm run lint`: ESLint on `src/**/*.ts`.
- `npm run lint:fix`: automatically fix many lint violations.
- `npm run agent:roles`: list available agent roles.
- `npm run agent:queue`: build the current session queue from agent files.
- `npm run agent:process`: run assigned roles headlessly in dry-run mode.

## Secrets And Local Config

- `screeps.json` is ignored and should never be committed.
- Use [screeps.sample.json](/Users/rafe/games/screeps/screeps.sample.json) as the template for new local configs.
- The private-server deployment path defaults to the Windows Screeps client path mounted into WSL, but can be overridden with `SCREEPS_LOCAL_PATH`.

## Known Sharp Edges

- Upstream docs in `docs/` still describe the starter kit broadly; this repo contains custom game logic beyond those docs.
- Integration tests are wired into the default `npm test` command along with unit tests.
- The unit-test harness and lint ruleset are partially out of date relative to the currently installed Node/Mocha/ESLint versions.
- If you touch `Memory` schemas, update the ambient interfaces in [src/main.ts](/Users/rafe/games/screeps/src/main.ts) and any default-memory helpers.
