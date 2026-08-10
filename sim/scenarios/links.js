"use strict";
/*
 * The link economy in isolation: an RCL5 room hand-placed to the layout's own
 * adjacency shape — source container + source link on one side, controller
 * container + controller link on the other, NO haulers on that route. Proves
 * (fast) that the source link fills from the miner, cycles across the room, and
 * feeds the upgraders — the whole route with zero hauler labor.
 *
 * Geometry matches what layout computes for spawn (25,25) / controller (25,15) /
 * source (10,40) on open terrain, so incorporation adopts every piece:
 *   source container (11,39)   [neighbor minimizing BFS-to-anchor]
 *   source link      (12,38)   [within 1 of container, ≥2 from source]
 *   ctrl container   (23,17)   [range-2 ring, ≥3 walkable neighbors, min BFS, (y,x)]
 *   ctrl link        (22,18)   [within 1 of container, ≥3 from controller]
 */
const W = require("./_world");

module.exports.setup = async (server, { modules }) => {
  await W.resetWorld(server);
  const room = "W1N1";

  await W.freshRoom(server, room);
  await W.addController(server, room, 25, 15, 0);
  await W.addSource(server, room, 10, 40);

  const bot = await server.world.addBot({ username: "bot", room, x: 25, y: 25, modules });
  await W.setController(server, room, bot.id, 5);

  await W.addStructure(server, room, "container", 11, 39, { energy: 500 });
  await W.addStructure(server, room, "container", 23, 17, { energy: 0 });
  await W.addStructure(server, room, "link", 12, 38, { user: bot.id, energy: 0 });
  await W.addStructure(server, room, "link", 22, 18, { user: bot.id, energy: 0 });
  await W.addStructure(server, room, "storage", 25, 27, { user: bot.id, energy: 5000 });

  const C = server.constants;
  const body = [C.WORK, C.WORK, C.CARRY, C.MOVE];
  const seeds = [
    [24, 24], [26, 24], [24, 26], [26, 26]
  ];
  for (let i = 0; i < seeds.length; i++) {
    await W.addCreep(server, room, seeds[i][0], seeds[i][1], bot.id, body, {
      name: `bot_seed${i}`,
      store: { energy: 0 }
    });
  }

  console.log(`[scenario] links: RCL5, source link → controller link, no hauler route`);
  return { rooms: [room], bots: { bot } };
};
