# Screeps AI

A Screeps AI in TypeScript, built on `screeps-typescript-starter`.

**The bot is being rebuilt from scratch (July 2026).** [src/main.ts](src/main.ts) is reset to the
starter kit's default loop (error-mapped, cleans dead-creep memory); the previous bot is preserved
on the `backup/pre-rebuild-2026-07-19` branch. What remains on `main` is the infrastructure: build +
deploy pipeline, unit/integration test harness, and a headless real-engine simulator.

## Infrastructure

- **Build**: `@rollup/plugin-typescript` bundles [src/main.ts](src/main.ts) → `dist/main.js`,
  targeting `es2024` (Screeps servers run Node 24).
- **Error mapping**: [src/utils/ErrorMapper.ts](src/utils/ErrorMapper.ts) (from the starter kit)
  maps runtime stack traces back to TypeScript source via source maps.
- **Deploy**: `rollup-plugin-screeps` uploads to targets defined in `screeps.json` (see
  [rollup.config.js](rollup.config.js) and the [deploy](deploy) / [deploy_private](deploy_private)
  wrappers).
- **Unit/integration tests**: mocha + chai with mocked Screeps globals
  ([test/helpers](test/helpers)). Fast, host-side, pure logic.
- **Headless sim**: [bin/sim](bin/sim) runs the real bundled bot in the real Screeps engine
  (Node 24, in Docker) over many ticks — see [sim/README.md](sim/README.md). Starting world states
  live in [sim/scenarios](sim/scenarios); behavioral regression tests in [sim/tests](sim/tests).

## Common Commands

```bash
npm run build      # bundle src/main.ts -> dist/main.js
npm run test       # unit + integration suites (mocha, host-side mocks)
npm run lint       # eslint (see Validation Notes — currently blocked by toolchain)
npm run push-main  # upload using the `main` target in screeps.json
npm run privateServer
npm run watch-main

bin/sim run [ticks]   # watch the real bot in the real engine, headless
bin/sim test          # behavioral regression tests in the real engine
```

## Local Setup

1. Install dependencies with `npm install` (Node >= 24).
2. Copy [screeps.sample.json](screeps.sample.json) to `screeps.json`.
3. Fill in Screeps credentials or server host settings.
4. For private-server deploys, set `SCREEPS_LOCAL_PATH` if the default local client path is wrong.

## Validation Notes

- `npm run build` is the reliable baseline check.
- `npm run test` runs the unit + integration suites (placeholder harness tests until the new bot has
  logic to cover).
- `npm run lint` is **currently broken repo-wide** with `Invalid value for lib provided: es2024` —
  the installed `@typescript-eslint` parser predates `es2024` and fails to parse every file. This is
  pre-existing toolchain debt; build and tests are the working gates.

## Guidance

- [CLAUDE.md](CLAUDE.md): start-here guide for contributors and agents.
- [docs/agents/SCREEPS_PRIMER.md](docs/agents/SCREEPS_PRIMER.md): Screeps rules that shape any bot.
- [sim/README.md](sim/README.md): the headless simulator, in depth.
- `docs/getting-started`, `docs/in-depth`, `docs/screeps-api`: generic starter and API references
  inherited from the template.
