# Screeps AI

A modular Screeps AI built on `screeps-typescript-starter`. The codebase was rebuilt from scratch
(June 2026) around one principle: **clean layer boundaries so every subsystem can be improved in
isolation.** Subsystems express their needs through two shared contracts — `Job` (persistent work) and
`SpawnRequest` (controller-requested creeps) — and shared services (spawning, matching, action
execution) staff them.

Full design: [docs/architecture/MODULAR_ARCHITECTURE.md](docs/architecture/MODULAR_ARCHITECTURE.md).

## Project Shape

- [src/main.ts](src/main.ts): kernel — ambient `Memory` schema and the tick pipeline.
- [src/config](src/config): central tunables (`constants.ts`).
- [src/cpu](src/cpu): bucket tiers (`CpuBudget`) and interval scheduling (`Scheduler`).
- [src/world](src/world): per-tick read model (`World`, `WorldRoom`).
- [src/jobs](src/jobs): persistent work (`Memory.jobs`) — `JobBoard` + economy generators.
- [src/matching](src/matching): sticky, capability-based assignment (`Matcher`, `capability`, `scoring`).
- [src/actions](src/actions): atomic `primitives`, shared `energy` helpers, and per-kind `executors`.
- [src/spawn](src/spawn): demand-driven spawning with a floor (`SpawnManager`, `bodies`, `queue`).
- [src/defense](src/defense): threat assessment + tower control.
- [src/base](src/base): minimal base planning (source containers + extensions).
- [src/intel](src/intel): passive scouting → `RoomIntel`.
- [src/controllers](src/controllers): tactical phase for controller-commanded creeps.
- [src/expansion](src/expansion), [src/combat](src/combat), [src/tasks](src/tasks): seams (stubs) for
  expansion, offensive combat, and the future task-chaining layer.

## Tick Pipeline

The kernel in [src/main.ts](src/main.ts) runs each tick in this order:

1. Bootstrap `Memory` + run version-gated migrations.
2. Rehydrate the `JobBoard` and delete dead creeps' memory.
3. Build the `World` read model.
4. Scouting (throttled) → `RoomIntel`.
5. Strategy: `assessDefense`, economy `generateJobs`, `planBase` (throttled), expansion/combat stubs —
   posting jobs and spawn requests.
6. `JobBoard.reconcile()` + `prune()`.
7. `SpawnManager.run()` — merge job demand + spawn requests + a population floor.
8. `Matcher.assign()` — sticky matching of idle economy creeps only.
9. Tactical: towers, controller-commanded creeps, then per-creep job executors.
10. Persist the `JobBoard`.
11. Opportunistic pixel generation when the bucket is high.

## Common Commands

```bash
npm run build      # bundle src/main.ts -> dist/main.js
npm run test       # unit + integration suites (mocha)
npm run lint       # eslint (see Validation Notes — currently blocked by toolchain)
npm run push-main  # upload using the `main` target in screeps.json
npm run push-sim
npm run privateServer
npm run watch-main
```

## Local Setup

1. Install dependencies with `npm install`.
2. Copy [screeps.sample.json](screeps.sample.json) to `screeps.json`.
3. Fill in Screeps credentials or server host settings.
4. For private-server deploys, set `SCREEPS_LOCAL_PATH` if the default local client path is wrong.

## Validation Notes

- `npm run build` is the reliable baseline check (bundles via `@rollup/plugin-typescript`).
- `npm run test` runs unit + integration suites (currently 24 unit + 1 integration, all passing).
- `npm run lint` is **currently broken repo-wide** with `Invalid value for lib provided: es2024` —
  the installed `@typescript-eslint` parser predates `es2024` and fails to parse every file. This is
  pre-existing toolchain debt; build and tests are the working gates.

## Guidance

- [AGENTS.md](AGENTS.md): start-here guide for contributors and agents.
- [docs/architecture/MODULAR_ARCHITECTURE.md](docs/architecture/MODULAR_ARCHITECTURE.md): the current design.
- [docs/agents/REPO_MAP.md](docs/agents/REPO_MAP.md): subsystem-by-subsystem map.
- [docs/agents/SCREEPS_PRIMER.md](docs/agents/SCREEPS_PRIMER.md): Screeps rules that shape the AI.
