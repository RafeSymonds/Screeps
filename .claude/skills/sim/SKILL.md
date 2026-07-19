---
name: sim
description: Run THIS Screeps bot in a real, headless Screeps engine (Node 24, in Docker) and watch how it actually behaves over many ticks — economy bootstrap, spawning, RCL/upgrade progress, construction, CPU. Use when the user wants to "test live", "simulate", "run it headless", "see how it works for real", watch the bot play, reproduce a multi-tick behavior, or sanity-check a spawning/scheduling/memory change against the genuine engine. NOT for pure-logic checks (use `npm run test`) and NOT the generic app-runner — this is the project's headless game-engine simulation via `bin/sim`.
allowed-tools: Bash Read Write Edit
argument-hint: [ticks] [--every N] [--scenario NAME] [--verbose]
---

# sim — headless live simulation

Runs the **real bundled bot** (`dist/main.js`) in the **real Screeps engine**, headless, on the
production Node major (24), inside Docker. This is for observing actual behavior over ticks, not
assertions. Reference: [sim/README.md](../../../sim/README.md), wrapper: [bin/sim](../../../bin/sim).

## When to use vs. not
- **Use** when the user wants to watch real behavior, reproduce a multi-tick issue, or validate a
  change to spawning, scheduling, defense, or memory ownership.
- **Don't use** for pure logic — that's `npm run test`. Don't reach for the generic `run`/`verify`
  skills here; this project's "run it for real" path is `bin/sim`.

## Workflow
1. **Preflight.** Confirm Docker is up: `docker info >/dev/null 2>&1`. If not, tell the user to start
   Docker Desktop (or suggest they run `! open -a Docker`) — don't try to work around it.
2. **Run.** From the repo root:
   - Default check: `bin/sim run 150`
   - Watch growth / economy: `bin/sim run 400 --every 25`
   - Debug the bot's own logging: `bin/sim run 200 --verbose` (bot console every tick + final Memory)
   - A specific world: `bin/sim run --scenario <name>`
   `bin/sim` rebuilds the bot itself; you do not need a separate `npm run build`. The **first** run
   builds the image and compiles `isolated-vm` (~a few minutes) — expect that and wait; later runs are fast.
3. **Read the output.** Each `[tNNN] ROOM/bot:` line is real engine state: `creeps=` + role mix,
   `RCL<level>(up=<progress>)`, `spawn=`/`ext=`/`cont=`/`stor=` energy, `towers=`, `sites=` (open
   construction sites), `src=` (source energy left), `cpu=` (that tick's CPU). Lines prefixed
   `[bot ENGINE]` are engine-level errors (e.g. the main module failed to load) — treat as failures.
4. **Interpret, don't just dump.** Report what the bot *did*: did the population grow?
   did RCL progress climb? did construction sites get built? is CPU sane? Call out anything
   that stalls (e.g. workers refilling spawn but never upgrading/building).

## Regression tests
For *asserted* long-term checks (not just watching), there is a behavioral test suite:
`bin/sim test` (or `bin/sim test -- --grep <name>`). It runs scenarios for many ticks in the
real engine and asserts on the timeline (economy growth, tower defense, CPU bounds, no crashes)
via `sim/lib/harness.js` `runScenario()`. It's separate from `npm run test` (host-side mocks).
Use the `build-scenario` skill to add scenarios and matching tests.

## Adding or editing a scenario
Worlds live in `sim/scenarios/`. Copy `default.js` and adjust. A scenario exports
`setup(server, { TerrainMatrix, modules })` and returns `{ rooms: string[], bots: { <name>: emitter } }`,
using the mockup world API (`reset`, `addRoom`, `setTerrain`, `addRoomObject`, `addBot`). `addBot`
claims the room controller at RCL1 and drops an owned spawn with 300 energy. Run with
`bin/sim run --scenario <name>`. Scenario files are bind-mounted — no image rebuild needed.

## Gotchas (do not "fix" these)
- The Node-24 stack is deliberate: mockup **git master** + `@screeps/driver@5.3.0` (`feat-node24`,
  patched `isolated-vm`). The stock npm mockup pins `isolated-vm@2.x` (Node ≤12) and will not build.
- `sim/run.js` rewrites `/etc/hosts` to force `localhost`→IPv4 before any tick. Removing it makes the
  driver fail to reach storage (`ECONNREFUSED` forever). It also silences benign startup reconnect noise.
- This runs in Docker because the host is Node 25 and can't build the engine's native modules.
