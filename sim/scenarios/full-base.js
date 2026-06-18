"use strict";
/*
 * A mature, self-sufficient room: RCL8 with the full structure allotment (3 spawns,
 * 60 extensions, 6 towers, storage, terminal, links, labs) — all energy stores
 * filled — plus a starting workforce. Use this to watch steady-state behavior and
 * CPU at scale, instead of waiting ~10k ticks for the economy to grow there.
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
  await W.addMineral(server, room, 40, 10);

  const bot = await server.world.addBot({ username: "bot", room, x: center.x, y: center.y, modules });
  const s = await W.fullBase(server, room, bot.id, { level: 8, center, creeps: 10 });

  console.log(`[scenario] full-base RCL${s.level}: ${s.spawns} spawns, ${s.extensions} ext, ${s.towers} towers, ${s.creeps} creeps`);
  return { rooms: [room], bots: { bot } };
};
