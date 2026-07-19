# Troubleshooting

This page outlines common issues you might encounter while setting up or developing this custom Screeps AI.

## Unable to Upload Code to a Private Server

If you receive errors about `/api/auth/signin` or `UnhandledPromiseRejectionWarning`:

1. Ensure the private server has [screepsmod-auth](https://github.com/ScreepsMods/screepsmod-auth) installed.
2. Verify you have set a password for the account on the private server.
3. Check `screeps.json` to ensure the `hostname`, `port`, `email`, and `password` match your private server configuration.
4. Try using `npm run privateServer` if you are deploying to a local server.

## Extending Type Interfaces (e.g., `Memory`, `CreepMemory`)

`@types/screeps` declares the global interfaces (`Memory`, `CreepMemory`, `RoomMemory`, …) as
open interfaces. To add fields, declare ambient interface extensions in `src/` (conventionally in
[src/main.ts](../../src/main.ts)) rather than casting at use sites.

## Unit Tests or Linting Failures

`npm run lint` is currently broken repo-wide by a toolchain mismatch (the installed
`@typescript-eslint` parser predates `es2024`). Check [CLAUDE.md](../../CLAUDE.md) for the current
baseline; build and tests are the working gates.
