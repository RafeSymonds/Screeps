---
name: build-scenario
description: Author a new headless-sim scenario for THIS Screeps bot — a specific starting world state to test against (full base, base under siege / invader wave, energy crisis, low-RCL bootstrap, multi-room, remote mining, nuke incoming, depleted storage, etc.). Use when the user wants to "build a scenario", "set up a situation", "simulate what happens when X", "test the bot against Y", or create/edit a world under sim/scenarios/. Writes a scenario file using the sim/scenarios/_world.js builder and verifies it with bin/sim. For running existing scenarios use the `sim` skill instead.
allowed-tools: Bash Read Write Edit
argument-hint: <describe the world state to simulate, e.g. "RCL7 base hit by 6 ranged invaders">
---

# build-scenario — author a sim world state

Create a new starting world under [sim/scenarios/](../../../sim/scenarios) so the bot can be
run against a specific situation with `bin/sim run --scenario <name>`. The hard part —
engine-correct object schemas — is already solved by the builder; **use it, don't reinvent shapes.**

Read first: [sim/scenarios/_world.js](../../../sim/scenarios/_world.js) (the builder API),
[sim/scenarios/full-base.js](../../../sim/scenarios/full-base.js) and
[under-attack.js](../../../sim/scenarios/under-attack.js) (worked examples),
[sim/README.md](../../../sim/README.md) (the "Authoring scenarios" section).

## Contract
A scenario file `sim/scenarios/<name>.js` exports:
```js
module.exports.setup = async (server, { TerrainMatrix, modules }) => {
  // ...build the world...
  return { rooms: ["W1N1"], bots: { bot } }; // bots: name -> the addBot() emitter
};
```
`modules` is the bundled bot — pass it to `server.world.addBot(...)`. Return at least one bot,
or the run errors. Names starting with `_` are helpers, not selectable scenarios.

## Builder API (`const W = require("./_world")`)
- `W.resetWorld(server)` then `W.freshRoom(server, room, terrain?)` — start every scenario this way.
- `W.addController(server, room, x, y)`, `W.addSource(...)`, `W.addMineral(...)`.
- `await server.world.addBot({ username, room, x, y, modules })` — **must run after a controller
  exists**; claims it at RCL1 and drops an owned spawn at `x,y`. Returns the bot emitter (has `.id`).
- `W.fullBase(server, room, botId, { level, center, creeps, safeMode })` — mature the base
  (controller→level, full structure allotment, filled energy, workforce) in one call.
- `W.setController(server, room, user, level, opts)` — force RCL / owner / `safeMode`.
- `W.addStructure(server, room, type, x, y, { user, level, energy, name })` — any structure type.
- `W.addUser(server, "Raiders")` — create an enemy user (returns id); place its creeps to make
  them hostile to the bot.
- `W.addHostiles(server, room, enemyId, count, { near, body })` — attackers; or `W.addCreep(...)`
  for one creep with an exact body. Body parts are engine constants on `server.constants`
  (`C.WORK`, `C.RANGED_ATTACK`, `C.HEAL`, `C.TOUGH`, ...).
- `W.Placer(box, { checkerboard, used })` — hand out distinct free tiles when laying out objects.

## Workflow
1. **Clarify the world** if vague: which RCL, how many/which structures, how much stored energy,
   what enemy (static vs. code-driven), how many rooms. Pick sensible defaults and state them.
2. **Write** `sim/scenarios/<name>.js` from the contract above, reusing `_world.js`. Keep the
   room walkable (the builder's checkerboard layout handles this; if placing by hand, leave gaps).
   `console.log("[scenario] ...")` a one-line summary of what was built.
3. **Test**: `bin/sim run 30 --scenario <name> --every 5`. Confirm: no `[sim] FAILED` / `[bot ENGINE]`
   errors, the expected objects show up in the state line (creeps, RCL, towers, `hostiles=`, energy),
   and the bot reacts as intended. Iterate on the file (it's bind-mounted — no image rebuild).
4. **Report** what the scenario sets up and what the short run showed.
5. **Optional — lock in the behavior** with a regression test in `sim/tests/<name>.test.js`
   (mocha + chai) using `require("../lib/harness").runScenario({ scenario: "<name>", ticks, every })`
   and asserting on `res.timeline` / `res.engineErrors` / `res.botErrors` (see existing tests and
   the `seriesOf` / `finalOf` helpers). Verify with `bin/sim test -- --grep <name>`. Do this when
   the user wants the scenario to guard against future regressions, not just a one-off look.

## Notes / gotchas
- For a *live two-sided fight*, add a second code-driven bot:
  `server.world.addBot({ username: "Aggressor", room, x, y, modules: { main: "<attack loop source>" } })`
  and return it in `bots` too — static `addHostiles` creeps don't path or fight back (they test the
  bot's *reaction*: detection + tower fire).
- A second owned room: `W.freshRoom` + `W.addController` + `W.fullBase` for the new room with the
  same `botId`, and add it to the returned `rooms`.
- Don't hard-code capacities/hits — `_world.js` reads them from `server.constants`. If you need a
  structure type the builder doesn't cover, add it to `structureAttrs` (mirror the shape in
  `@screeps/engine` `processor/intents/creeps/build.js`).
- Requires Docker running, same as the `sim` skill.
