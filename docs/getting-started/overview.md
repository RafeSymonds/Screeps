# Project Overview

This repository is a Screeps AI being rebuilt from scratch (July 2026). The upstream starter kit's
infrastructure — TypeScript build, deploy targets, mocha test harness, and a headless real-engine
simulator — is fully working; the bot logic in [src/main.ts](../../src/main.ts) is the starter
kit's default game loop waiting for the new design.

## Common Development Commands

- `npm run build`: bundle the project without uploading.
- `npm run privateServer`: deploy to the local path in `screeps.json` (baseline local check).
- `npm run test`: unit + integration tests.
- `npm run lint`: ESLint on `src/**/*.ts` (see `CLAUDE.md` for current status).
- `npm run push-main`: deploy to the "main" target in `screeps.json`.
- `bin/sim run [ticks]`: watch the real bot in the real engine, headless (see `sim/README.md`).
