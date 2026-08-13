# AGENTS.md

This repository is a Screeps AI written in TypeScript, **being rebuilt from scratch (July 2026)**.
The previous bot and its design docs live on the `backup/pre-rebuild-2026-07-19` branch (pushed to
origin); [src/main.ts](src/main.ts) on `main` is reset to the starter kit's default loop, with the
starter's `utils/ErrorMapper.ts` for source-mapped stack traces. The build/deploy/test/sim
infrastructure is fully working.

## What Screeps Is

Screeps is an MMO programming game: you don't play it directly — your code does. The JavaScript
you upload runs on the game server in an endless loop, once per **game tick** (a few real seconds
each), even while you're offline. Your code commands **creeps** (units assembled from body parts)
to harvest energy, build structures, upgrade your **room controller** (RCL — gates what you're
allowed to build), defend territory, and expand across a persistent world of 50×50-tile rooms
shared with other players.

The rules that shape everything:

-   Each tick the server calls your exported `loop`. The **JS global environment can be reset at
    any time**; the only durable state is the `Memory` object (JSON-serialized between ticks).
-   You have a **CPU budget per tick** plus a bucket that absorbs bursts. Inefficient code doesn't
    just run slowly — when you exceed the budget, your bot stops mid-tick and skips actions.
-   Creep actions are **intents**, all resolved together at tick end; a creep gets one action of a
    given type per tick.
-   Creeps expire (1500-tick lifetime), so an economy must perpetually respawn its own labor or it
    collapses.

Read [docs/agents/SCREEPS_PRIMER.md](docs/agents/SCREEPS_PRIMER.md) for the condensed rules that
matter when designing bot logic.

## Where The Screeps API Docs Are

-   **Local mirror (use this first): [docs/screeps-api/](docs/screeps-api/index.md)** — the
    official API reference and gameplay guides, offline. `api-*.md` files cover the API surface
    (`Game`, `Creep`, `Room`, structures, `Memory`/`PathFinder`/constants); `guide-*.md` files
    cover game concepts (control, creeps, defense, CPU, market, …). Start at
    [docs/screeps-api/index.md](docs/screeps-api/index.md).
-   **Official online docs**: https://docs.screeps.com/api/ (API reference) and
    https://docs.screeps.com/ (guides) — for anything the mirror lacks.
-   **Types**: `@types/screeps` provides the typed API surface; if the types and the docs disagree,
    verify against the docs.

## Development Process: Design → Spec → Build → Test

**We always design before we build.** No non-trivial feature or subsystem starts as code.

1.  **Write a design doc first** in `docs/design/<feature>.md` (create the directory with the first
    doc). Small fixes and mechanical changes don't need one; anything with a new Memory schema, a
    new subsystem, or cross-tick behavior does.
2.  **Spec it fully.** A design doc is done when it answers:
    -   **Goal** — what problem this solves and how we'll know it works.
    -   **Interface** — the contract it exposes and the contracts it consumes (types first).
    -   **Memory schema** — exact fields, who owns them, and how stale/missing data is handled.
    -   **Tick flow** — what runs each tick, in what order, and what is throttled or skipped when
        CPU is tight.
    -   **Edge cases** — global reset mid-operation, lost room visibility, creeps dying mid-task,
        empty/wiped rooms.
    -   **Test plan** — which logic gets unit tests, and which sim scenario(s) prove the behavior.
3.  **Build to the spec.** If implementation reveals the spec is wrong, update the spec first, then
    the code. Design docs are living documents — behavior changes and doc changes land together.
4.  **Test at both levels** (see Testing Strategy).

## Build With Abstractions

The core rule for this codebase: **separate deciding from doing, and hide the game API behind
narrow seams.**

-   **Pure core, thin shell.** Decision logic — what to build, which creep does what, how many to
    spawn, where to expand — is written as pure functions over plain data: no `Game`/`Memory`
    globals, no live game objects. A thin adapter layer reads game state into plain structures on
    the way in and turns decisions into game intents on the way out. This is what makes the logic
    unit-testable on the host, and it's the default shape for every new subsystem.
-   **Subsystems communicate through explicit contracts.** When two subsystems interact, define the
    shared types in one place and depend on those — never on each other's internals. Any subsystem
    should be reimplementable without touching its consumers.
-   **Wrap expensive queries once.** `room.find`, pathfinding, and other per-tick scans go behind a
    shared read-model/caching layer rather than being called ad hoc, so CPU cost is centralized,
    cached, and visible.
-   **Each subsystem owns its `Memory` slice.** Ambient interface extensions are declared in
    [src/main.ts](src/main.ts); one owner writes a given slice, everyone else treats it as
    read-only. Schema changes update the ambient types and handle old persisted data.
-   **Prefer enums over bare string literals.** Named string sets — including discriminated-union
    tags (e.g. `kind` fields) and other categorical values — should be backed by a string enum, not
    loose `"..."` literals scattered across producers and consumers.

## Testing Strategy

-   **Everything gets unit tests.** All decision logic must be unit-tested via `npm run test`
    (mocha + chai, mocked Screeps globals in `test/helpers/`). If a piece of logic can't be unit
    tested because it's tangled with live game objects, that is a design smell — extract the pure
    core rather than skipping the test.
-   **Bigger components get sim tests.** Multi-tick, emergent behavior — economy bootstrap, spawn
    cadence, construction, defense reaction, wipe recovery — is verified in the real engine with
    `bin/sim test` (`sim/tests/`, asserting on tick timelines) against worlds in `sim/scenarios/`.
    When a new subsystem-level capability lands, add or extend a scenario and a sim suite for it.
-   `bin/sim run` is for watching and debugging real behavior; it is not a substitute for asserted
    tests.

## Baseline (current)

-   Runtime: Screeps is **Node.js 24 (V8 13.6)**; the build targets **`es2024`** via
    `@rollup/plugin-typescript`. Local toolchain needs Node `>=24`.
-   Modern JS runs natively (optional chaining, nullish coalescing, `Array.at`/`findLast`/`toSorted`,
    `Object.hasOwn`/`groupBy`, `String.replaceAll`). Host-only Node APIs (`fs`, `process`, `crypto`,
    real timers) are unavailable inside the isolated-vm sandbox.
-   CPU matters. Avoid per-tick allocations, repeated global scans, and noisy logging in hot paths.
    Creep body design is constrained by spawn energy, fatigue, carry throughput, and lifetime.
-   Many bugs only appear over multiple ticks. When changing scheduling, spawning, or memory
    ownership, reason across several ticks.
-   `npm run lint` is **clean and is a gate** (fixed Aug 2026: `@typescript-eslint` 7 → 8, which
    understands the `es2024` lib; v7 failed to parse every file). `sort-imports` is deliberately
    **off** — this repo groups imports by provenance (`shared/*` contracts, then other subsystems,
    then the module's own files, each alphabetical by path) and the rule would scramble that.
-   If changing deploy behavior, also inspect [rollup.config.js](rollup.config.js) and the shell
    wrappers [deploy](deploy) and [deploy_private](deploy_private).

## Current Commands

-   `npm run build`: bundle without uploading.
-   `npm run push-main`: upload using the `main` target from `screeps.json`.
-   `npm run privateServer`: deploy to the local path controlled by `SCREEPS_LOCAL_PATH`.
-   `npm run test`: unit and integration tests (mocha + chai, mocked Screeps globals in
    `test/helpers/`).
-   `npm run lint` / `npm run lint:fix`: ESLint on `src/**/*.ts`. Clean; keep it that way.
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
-   `bin/sim test`: behavioral **regression tests** in two tiers, run in **parallel**
    (`SIM_JOBS` workers, default 4). The default FAST suite (`sim/tests/`, staged scenarios,
    a few minutes) is the iteration loop; `bin/sim test --full` adds the full-arc suites
    (`sim/tests-full/`, ~40 min) and is required before every milestone commit. Iterate on one
    suite with `bin/sim test -- --grep <name>`. Add cases with `sim/lib/harness.js`
    `runScenario()`.
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

-   Upstream docs in `docs/getting-started` and `docs/in-depth` are generic starter references,
    not descriptions of this bot.
-   `npm test` runs integration tests alongside unit tests.
