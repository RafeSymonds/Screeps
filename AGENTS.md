# AGENTS.md

This repository is a modular Screeps AI written in TypeScript. Optimize for safe, incremental changes
that respect the layer boundaries below and preserve in-game stability and CPU efficiency.

The bot was rebuilt from scratch in June 2026. The current design is
[docs/architecture/MODULAR_ARCHITECTURE.md](docs/architecture/MODULAR_ARCHITECTURE.md).

## Start Here

1. Read [README.md](README.md).
2. Read [docs/architecture/MODULAR_ARCHITECTURE.md](docs/architecture/MODULAR_ARCHITECTURE.md) — layers, contracts, pipeline.
3. Read [docs/agents/REPO_MAP.md](docs/agents/REPO_MAP.md) — subsystem map.
4. Read [docs/agents/SCREEPS_PRIMER.md](docs/agents/SCREEPS_PRIMER.md) — Screeps rules that shape the AI.
5. Before risky changes, scan the [Review Checklist](docs/qa/REVIEW_CHECKLIST.md) (or the lightweight
   [Regression Checklist](docs/qa/REGRESSION_CHECKLIST.md)); for memory schema changes follow the
   [Memory Migration Rules](docs/qa/MEMORY_MIGRATIONS.md).
6. Inspect the code you are about to change, starting from [src/main.ts](src/main.ts).

## Repository Intent

- The runtime is the Screeps game loop: code is re-evaluated each tick, with persistent `Memory` and
  ephemeral globals.
- The pipeline is:
  `bootstrap memory -> rehydrate JobBoard -> build World -> scouting -> strategy (post jobs/requests)
  -> reconcile/prune jobs -> spawn -> match -> tactical (towers, controllers, job executors) -> persist`.
- Subsystems communicate **only** through two shared contracts: `Job` (`src/jobs/types.ts`, persisted
  in `Memory.jobs`) and `SpawnRequest` (`src/spawn/types.ts`). Shared services — spawning, matching,
  action execution — staff that demand.

## Architectural Guardrails

- **Three registries extend the economy.** Adding a job kind means adding one entry to each of:
  generator (`src/jobs/generators/index.ts`), capability (`src/matching/capability.ts`), and executor
  (`src/actions/executors/index.ts`). The pipeline, `JobBoard`, `Matcher`, and `SpawnManager` stay
  untouched. Prefer this over editing the core.
- **Deterministic job ids.** Generators upsert by a stable id (e.g. `harvest:<sourceId>`) so jobs are
  idempotent and self-healing. Don't generate random ids.
- **Capability-based assignment.** `CreepMemory` has no behavioral role. `spawnRole` is a
  body/population tag only; what a creep does is decided by `Matcher` from its body.
- **Hybrid command model.** Economy creeps are job-matched. Controller subsystems (defense/combat/
  expansion) request creeps via `SpawnRequest` and command them imperatively; such creeps carry
  `CreepMemory.controller` and are skipped by the matcher.
- **Demand-driven spawning + floor.** `SpawnManager` derives demand from open job slots vs live parts,
  and always keeps a minimum generalist floor so a wiped room recovers. If you add jobs, you affect
  spawn pressure.
- **Memory schema changes** to `src/main.ts` ambient interfaces MUST follow
  [MEMORY_MIGRATIONS.md](docs/qa/MEMORY_MIGRATIONS.md).
- **Throttling awareness.** Non-critical passes run through `src/cpu/Scheduler.ts` and may be skipped
  when the bucket is low. Code must tolerate stale `RoomMemory`.

## Baseline (current)

- Runtime: Screeps is **Node.js 24 (V8 13.6)**; the build targets **`es2024`** via
  `@rollup/plugin-typescript`. Local toolchain needs Node `>=20`.
- `npm run build` passes (bundles `src/main.ts` → `dist/main.js`).
- `npm run test` passes: 17 unit + 1 integration tests.
- `npm run lint` is **broken repo-wide**: `Invalid value for lib provided: es2024` — the installed
  `@typescript-eslint` parser predates es2024 and fails on every file (including untouched ones). This
  is toolchain debt, not a code regression; build + tests are the gates.
- If changing deploy behavior, also inspect [rollup.config.js](rollup.config.js) and the shell
  wrappers [deploy](deploy) and [deploy_private](deploy_private).

## Screeps-Specific Constraints

- CPU matters. Avoid per-tick allocations, repeated global scans, and noisy logging in hot paths. The
  `WorldRoom` read model exists so subsystems don't call `room.find` ad hoc.
- `Memory` survives ticks; globals do not. Module-level caches must tolerate global resets.
- Creep body design is constrained by spawn energy, fatigue, carry throughput, and lifetime.
- Many bugs only appear over multiple ticks. When changing scheduling, spawning, or memory ownership,
  reason across several ticks.
- Modern JS runs natively (optional chaining, nullish coalescing, `Array.at`/`findLast`/`toSorted`,
  `Object.hasOwn`/`groupBy`, `String.replaceAll`). Host-only Node APIs (`fs`, `process`, `crypto`,
  real timers) are unavailable inside the isolated-vm sandbox.

## Current Commands

- `npm run build`: bundle without uploading.
- `npm run push-main`: upload using the `main` target from `screeps.json`.
- `npm run privateServer`: deploy to the local path controlled by `SCREEPS_LOCAL_PATH`.
- `npm run test`: unit and integration tests.
- `npm run lint` / `npm run lint:fix`: ESLint on `src/**/*.ts` (see baseline note above).

## Secrets And Local Config

- `screeps.json` is ignored and must never be committed.
- Use [screeps.sample.json](screeps.sample.json) as the template for new local configs.
- The private-server deployment path can be overridden with `SCREEPS_LOCAL_PATH`.

## Known Sharp Edges

- Upstream docs in `docs/getting-started`, `docs/in-depth`, and `docs/screeps-api` are generic starter
  / API references, not descriptions of this bot.
- `npm test` runs integration tests alongside unit tests.
- If you touch `Memory` schemas, update the ambient interfaces in [src/main.ts](src/main.ts) and the
  initializer in [src/memory/bootstrap.ts](src/memory/bootstrap.ts).
