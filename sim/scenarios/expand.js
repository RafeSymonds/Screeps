"use strict";
/*
 * Expansion: a healthy RCL5 sponsor next to a neutral 2-source room, with enough
 * GCL banked to claim a second room.
 *
 * GCL is POINTS, not a level: `claimController` compares `user.gcl` against
 * `GCL_MULTIPLY × (claimedRooms)^GCL_POW`, so claiming a 2nd room needs
 * 1,000,000 — passing `gcl: 2` would silently do nothing (the intent just
 * returns, with no return code and no log: it looks exactly like "the claimer
 * stands next to the controller forever").
 *
 * Two suites run against this world: the FAST one asserts the claim lands, the
 * FULL one (tests-full/) follows the whole arc to W2N1 spawning its own creep.
 */
const W = require("./_world");

module.exports.setup = async (server, { modules }) => {
  await W.resetWorld(server);
  const home = "W1N1";
  const target = "W2N1"; // the west neighbor
  const center = { x: 25, y: 25 };

  await W.freshRoom(server, home);
  await W.addController(server, home, 25, 15, 0);
  await W.addSource(server, home, 10, 40);
  await W.addSource(server, home, 40, 40);

  // The prize: unowned, two sources, plenty of room to plan a base in.
  await W.freshRoom(server, target);
  await W.addController(server, target, 25, 25, 0);
  await W.addSource(server, target, 15, 20);
  await W.addSource(server, target, 35, 30);

  const bot = await server.world.addBot({
    username: "bot",
    room: home,
    x: center.x,
    y: center.y,
    gcl: 1_000_000, // = GCL level 2: exactly one more room than we own
    modules
  });

  await W.fullBase(server, home, bot.id, { level: 5, center, creeps: 8 });
  await W.seedSurroundingTerrain(server, [home, target]);

  console.log(`[scenario] expand: RCL5 ${home} (GCL2) + neutral ${target} to claim`);
  return { rooms: [home, target], bots: { bot } };
};
