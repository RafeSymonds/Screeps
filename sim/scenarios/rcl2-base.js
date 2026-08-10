"use strict";
/*
 * The build-out era's starting line: an RCL2 room (default's geometry) with a
 * seeded 300-cap generalist workforce and an EMPTY footprint — exactly the state
 * the bootstrap era hands to construction. Exists so the fast gate can prove
 * "extensions get sequenced and built" in ~900 ticks instead of replaying the
 * ~1000-tick bootstrap ramp first (the full arc lives in the slow suite).
 *
 * Seeded creeps have no memory; economy's orphan adoption staffs them on tick 1.
 */
const W = require("./_world");

module.exports.setup = async (server, { modules }) => {
  await W.resetWorld(server);
  const room = "W1N1";

  await W.freshRoom(server, room);
  await W.addController(server, room, 25, 18, 0);
  await W.addSource(server, room, 10, 40);
  await W.addSource(server, room, 40, 40);

  const bot = await server.world.addBot({ username: "bot", room, x: 25, y: 25, modules });
  await W.setController(server, room, bot.id, 2);

  const C = server.constants;
  const body = [C.WORK, C.WORK, C.CARRY, C.MOVE]; // real 2-WORK bodies: 1-WORK seeds drip 2 e/t and piles never reach minPickup (probe-measured)
  const spots = [
    [23, 23], [27, 23], [23, 27], [27, 27], [21, 25], [29, 25],
  ];
  for (let i = 0; i < spots.length; i++) {
    await W.addCreep(server, room, spots[i][0], spots[i][1], bot.id, body, {
      name: `bot_seed${i}`,
      store: { energy: 0 }
    });
  }

  console.log(`[scenario] rcl2-base: RCL2, empty footprint, ${spots.length} seed generalists`);
  return { rooms: [room], bots: { bot } };
};
