"use strict";
/*
 * Remote mining at range: the worthwhile room is TWO borders out, and the room
 * next door is barren.
 *
 * Home W1N1 is a built-out RCL4 room with a workforce, so it can fund remote
 * labor immediately. W2N1 (the west neighbor) is a neutral room with a controller
 * and NO sources — nothing to mine, so a bot that only ever looks next door finds
 * nothing and stops. W3N1, one border further, has two sources and is the whole
 * point of the scenario.
 *
 * This is the shape the field actually has: the four rooms adjacent to a home are
 * a small and arbitrary sample, and two of them are typically highways. Proving
 * the bot reaches past a dud neighbour is proving it can mine a real map.
 *
 * Watch for: intel recording W3N1 (the scout walked two rooms), W1N1's remotes
 * slice adopting it, and bot creeps working in W3N1.
 */
const W = require("./_world");

module.exports.setup = async (server, { modules }) => {
  await W.resetWorld(server);
  const home = "W1N1";
  const mid = "W2N1"; // barren neighbour — reachable, worthless
  const far = "W3N1"; // the real remote, two borders out
  const center = { x: 25, y: 25 };

  await W.freshRoom(server, home);
  await W.addController(server, home, 25, 15, 0);
  await W.addSource(server, home, 10, 40);
  await W.addSource(server, home, 40, 40);

  // Next door: a real neutral room, just an empty one. It must be crossed, not mined.
  await W.freshRoom(server, mid);
  await W.addController(server, mid, 25, 25, 0);

  // Two rooms out: the two-source room worth the trip.
  await W.freshRoom(server, far);
  await W.addController(server, far, 25, 25, 0);
  await W.addSource(server, far, 15, 20);
  await W.addSource(server, far, 35, 30);

  const bot = await server.world.addBot({ username: "bot", room: home, x: center.x, y: center.y, modules });
  await W.fullBase(server, home, bot.id, { level: 4, center, creeps: 6 });

  // Real terrain around all three, so the two-room crossing paths like production.
  await W.seedSurroundingTerrain(server, [home, mid, far]);

  console.log(`[scenario] remote-far: RCL4 ${home} + barren ${mid} + 2-source ${far} (depth 2)`);
  return { rooms: [home, mid, far], bots: { bot } };
};
