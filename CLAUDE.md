# AGENTS.md

This repository is a Screeps AI written in TypeScript, **being rebuilt from scratch (July 2026)**.
The previous bot and its design docs live on the `backup/pre-rebuild-2026-07-19` branch (pushed to
origin); [src/main.ts](src/main.ts) on `main` is reset to the starter kit's default loop, with the
starter's `utils/ErrorMapper.ts` for source-mapped stack traces. The build/deploy/test/sim infrastructure
is fully working — new design decisions should be documented as they are made, not assumed from the
old bot.

## Start Here

1. Read [README.md](README.md) — what exists, commands, local setup.
2. Read [docs/agents/SCREEPS_PRIMER.md](docs/agents/SCREEPS_PRIMER.md) — Screeps rules that shape
   any bot design.
3. Inspect [src/main.ts](src/main.ts) — the entry point the engine calls each tick.

## Screeps-Specific Constraints

-   The runtime is the Screeps game loop: code is re-evaluated each tick, with persistent `Memory`
    and ephemeral globals. Module-level caches must tolerate global resets.
-   CPU matters. Avoid per-tick allocations, repeated global scans, and noisy logging in hot paths.
-   Creep body design is constrained by spawn energy, fatigue, carry throughput, and lifetime.
-   Many bugs only appear over multiple ticks. When changing scheduling, spawning, or memory
    ownership, reason across several ticks.
-   Modern JS runs natively (optional chaining, nullish coalescing, `Array.at`/`findLast`/`toSorted`,
    `Object.hasOwn`/`groupBy`, `String.replaceAll`). Host-only Node APIs (`fs`, `process`, `crypto`,
    real timers) are unavailable inside the isolated-vm sandbox.
-   **Prefer enums over bare string literals.** Named string sets — including discriminated-union
    tags (e.g. `kind` fields) and other categorical values — should be backed by a string enum, not
    loose `"..."` literals scattered across producers and consumers.

## Baseline (current)

-   Runtime: Screeps is **Node.js 24 (V8 13.6)**; the build targets **`es2024`** via
    `@rollup/plugin-typescript`. Local toolchain needs Node `>=24`.
-   `npm run lint` is **broken repo-wide**: `Invalid value for lib provided: es2024` — the installed
    `@typescript-eslint` parser predates es2024 and fails on every file (including untouched ones).
    This is toolchain debt, not a code regression; build + tests are the gates.
-   If changing deploy behavior, also inspect [rollup.config.js](rollup.config.js) and the shell
    wrappers [deploy](deploy) and [deploy_private](deploy_private).

## Current Commands

-   `npm run build`: bundle without uploading.
-   `npm run push-main`: upload using the `main` target from `screeps.json`.
-   `npm run privateServer`: deploy to the local path controlled by `SCREEPS_LOCAL_PATH`.
-   `npm run test`: unit and integration tests (mocha + chai, mocked Screeps globals in
    `test/helpers/`; currently placeholder harness tests).
-   `npm run lint` / `npm run lint:fix`: ESLint on `src/**/*.ts` (see baseline note above).
-   `bin/sim run [ticks]`: run the real bot in the real Screeps engine **headless** (Node 24,
    in Docker) and print live per-tick room state — economy, spawns, CPU. Not unit tests;
    for watching real behavior over many ticks. See [sim/README.md](sim/README.md).

## Headless Simulation

`bin/sim` runs the **real bot in the real Screeps engine, headless, on Node 24** (in Docker),
so you can watch actual behavior over many ticks — economy bootstrap, spawn pressure, RCL
progress, CPU — that unit tests can't surface. Use it to sanity-check multi-tick behavior
changes; keep `npm run test` for pure logic. Full details and rationale:
[sim/README.md](sim/README.md).

-   `bin/sim run [ticks]`: build the bot (`npm run build`), tick a fresh RCL1 world, print live
    room state, exit. Flags: `--every N` (state cadence), `--scenario NAME`, `--verbose`
    (bot console each tick + final Memory dump). It is a batch tool, not a daemon.
-   `bin/sim test`: behavioral **regression tests** (`sim/tests/`) that run scenarios for many
    ticks in the real engine and assert on the timeline. Currently a smoke test (bot loads and
    ticks without errors); add cases with the `sim/lib/harness.js` `runScenario()` helper as the
    new bot gains capabilities. A separate, slower suite from `npm run test`.
-   `bin/sim build` / `shell` / `clean`: manage the Docker engine image.
-   Requires Docker running. The **first** build compiles a patched `isolated-vm` (~a few
    minutes); later runs reuse the image. The bot bundle is bind-mounted, so editing
    `src/**` then re-running `bin/sim run` picks up changes without an image rebuild.
-   Scenarios (starting world states) live in `sim/scenarios/` and are picked with
    `--scenario <name>`: `default` (fresh RCL1), `growth` (RCL3, empty footprint), `full-base`
    (mature RCL8 + workforce), `wiped-base` (intact base, zero creeps), `under-attack` (defended
    base + hostile wave), `remote-mining` / `remote-invader` (home room + adoptable neighbor).
    Build new ones with the `sim/scenarios/_world.js` helpers; to author one, use the
    **`/build-scenario`** skill.
-   Node-24 reality, don't "simplify" away: the harness installs the mockup's **git master** +
    `@screeps/driver@5.3.0` (`feat-node24`) and applies a `localhost`→IPv4 fix in `sim/run.js`
    (storage binds `::1`, the driver dials `127.0.0.1`). Removing either re-breaks the engine.

## Secrets And Local Config

-   `screeps.json` is ignored and must never be committed.
-   Use [screeps.sample.json](screeps.sample.json) as the template for new local configs.
-   The private-server deployment path can be overridden with `SCREEPS_LOCAL_PATH`.

## Known Sharp Edges

-   Upstream docs in `docs/getting-started`, `docs/in-depth`, and `docs/screeps-api` are generic
    starter / API references, not descriptions of this bot.
-   `npm test` runs integration tests alongside unit tests.
