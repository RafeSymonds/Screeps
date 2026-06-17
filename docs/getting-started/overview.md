# Project Overview

This repository is a modular Screeps AI (rebuilt June 2026) that replaces the empty logic of the
upstream starter kit with a persistent, CPU-aware tick loop organized into clean layers.

## Core Tick Pipeline

The AI runs a structured pipeline every tick:

1. **Memory bootstrap**: init `Memory`, run migrations, rehydrate the `JobBoard`, clean dead creeps.
2. **World view**: build the per-tick `World`/`WorldRoom` read model.
3. **Strategy (throttled)**: scouting, economy job generation, defense assessment, base planning —
   posting jobs and spawn requests. Non-critical passes are skipped when the CPU bucket is low.
4. **Spawning**: merge job demand + controller spawn requests + a population floor.
5. **Matching**: assign idle creeps to open jobs by capability (sticky).
6. **Execution**: towers, controller-commanded creeps, then per-creep job executors.
7. **Persistence**: write the `JobBoard` back to `Memory`.

For subsystem detail, see the [Repo Map](../agents/REPO_MAP.md) and
[Modular Architecture](../architecture/MODULAR_ARCHITECTURE.md).

## Common Development Commands

- `npm run build`: bundle the project without uploading.
- `npm run privateServer`: deploy to the local path in `screeps.json` (baseline local check).
- `npm run test`: unit + integration tests.
- `npm run lint`: ESLint on `src/**/*.ts` (see `AGENTS.md` for current status).
- `npm run push-main`: deploy to the "main" target in `screeps.json`.
