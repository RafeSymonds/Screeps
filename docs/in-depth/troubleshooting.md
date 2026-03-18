# Troubleshooting

This page outlines common issues you might encounter while setting up or developing this custom Screeps AI.

## Unable to Upload Code to a Private Server

If you receive errors about `/api/auth/signin` or `UnhandledPromiseRejectionWarning`:

1. Ensure the private server has [screepsmod-auth](https://github.com/ScreepsMods/screepsmod-auth) installed.
2. Verify you have set a password for the account on the private server.
3. Check `screeps.json` to ensure the `hostname`, `port`, `email`, and `password` match your private server configuration.
4. Try using `npm run privateServer` if you are deploying to a local server.

## Unable to Extend Type Interfaces (e.g., `Memory`, `CreepMemory`)

The ambient declarations for global Screeps interfaces are primarily located in [src/main.ts](../../src/main.ts).

If you are adding new fields to `Memory`, `CreepMemory`, or `RoomMemory`, you must update the interfaces in `src/main.ts`. Note that any changes to these global contracts should be reviewed by the **technical-architect**.

For more on memory management, see the [Repo Map](../agents/REPO_MAP.md).

## Unit Tests or Linting Failures

The project currently has some legacy lint and test debt. Check [AGENTS.md](../../AGENTS.md) for the current baseline. If your changes introduce *new* failures, ensure they are resolved, but be aware that some pre-existing failures may be present in the codebase.

