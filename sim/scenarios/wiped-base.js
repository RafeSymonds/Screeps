"use strict";
/*
 * A mature RCL4 base with its entire workforce wiped out: every structure intact
 * (spawn, 20 extensions, tower, a storage holding a large energy reserve) but
 * ZERO creeps alive. This is the "recovered from a raid / global reset that
 * killed everyone" state.
 *
 * Use this to test the population *floor* and wipe recovery (SpawnManager: a room
 * with no working labor must always respawn from whatever energy is on hand). The
 * bot should spawn a generalist immediately, rebuild a specialized economy from
 * the stored energy, and resume upgrading the controller — none of which a
 * scenario that starts with a healthy workforce exercises.
 */
const W = require("./_world");

module.exports.setup = async (server, { modules }) => {
  await W.resetWorld(server);
  const room = "W1N1";
  const center = { x: 25, y: 25 };

  await W.freshRoom(server, room);
  await W.addController(server, room, 25, 15, 0);
  await W.addSource(server, room, 10, 40);
  await W.addSource(server, room, 40, 40);

  const bot = await server.world.addBot({ username: "bot", room, x: center.x, y: center.y, modules });

  // Build a mature RCL4 base, then leave it with no creeps at all.
  const s = await W.fullBase(server, room, bot.id, { level: 4, center, creeps: 0 });

  console.log(`[scenario] wiped-base: RCL${s.level} base, ${s.extensions} ext, 0 creeps — must recover`);
  return { rooms: [room], bots: { bot } };
};
