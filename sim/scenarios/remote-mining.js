"use strict";
/*
 * Remote mining: a built-out RCL4 home room next to a neutral room the bot should
 * adopt as a remote energy farm. Exercises the whole empire-layer loop end to end
 * (see docs/architecture/EMPIRE.md):
 *
 *   scout W2N1 -> record intel -> empire assigns it to W1N1 -> spawn a remote miner
 *   (travels, drop-mines) -> spawn a remote hauler (ferries the output back to W1N1
 *   storage) -> spawn a reserver (holds the controller at 10 e/tick).
 *
 * Home is fully built (extensions + storage filled) with a starting workforce so it
 * is immediately "healthy" (past the population floor) and can fund remote labor and
 * a reserver from tick 1 instead of waiting out a bootstrap ramp. The neighbor W2N1
 * is the WEST exit of W1N1 (adjacent), unowned, with two sources.
 *
 * Watch for: a `scout`/`miner`/`hauler`/`claimer` appearing, W1N1 storage energy
 * climbing faster than its two local sources alone could supply, and (with --verbose)
 * Memory.empire.remotes["W2N1"] = { owner:"W1N1", active:true, reserve:true }.
 */
const W = require("./_world");

module.exports.setup = async (server, { modules }) => {
  await W.resetWorld(server);
  const home = "W1N1";
  const remote = "W2N1"; // the west neighbor of W1N1
  const center = { x: 25, y: 25 };

  await W.freshRoom(server, home);
  await W.addController(server, home, 25, 15, 0);
  await W.addSource(server, home, 10, 40);
  await W.addSource(server, home, 40, 40);

  // Neutral neighbor: unowned controller + two sources — the remote to adopt.
  await W.freshRoom(server, remote);
  await W.addController(server, remote, 25, 25, 0);
  await W.addSource(server, remote, 15, 20);
  await W.addSource(server, remote, 35, 30);

  const bot = await server.world.addBot({ username: "bot", room: home, x: center.x, y: center.y, modules });

  // Built-out RCL4 home (extensions + storage filled) with a workforce, so the room
  // is healthy and can fund remote creeps + a reserver immediately.
  await W.fullBase(server, home, bot.id, { level: 4, center, creeps: 6 });

  // Real terrain for the rooms around both, so multi-room pathfinding (scout/miner/
  // hauler/reserver crossing the W1N1<->W2N1 border) behaves like production.
  await W.seedSurroundingTerrain(server, [home, remote]);

  console.log(`[scenario] remote-mining: RCL4 ${home} + neutral ${remote} (2 sources)`);
  return { rooms: [home, remote], bots: { bot } };
};
