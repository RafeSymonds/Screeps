"use strict";
/*
 * A defended RCL7 base (3 full towers) with safe mode OFF, plus a wave of hostile
 * melee creeps parked at the doorstep owned by an enemy player. Use this to watch
 * threat detection and tower fire: hostiles= should drop as towers/towerEnergy
 * engage, and the bot may spawn defenders.
 *
 * The raiders have no AI (they don't path or fight back) — they're a static threat
 * to exercise the bot's *reaction*. For a live two-sided fight, add a second bot
 * with attack code via server.world.addBot({ ..., modules: <aggressor> }).
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
  await W.fullBase(server, room, bot.id, { level: 7, center, creeps: 6, safeMode: null });

  const enemy = await W.addUser(server, "Raiders");
  const C = server.constants;
  const raiders = await W.addHostiles(server, room, enemy, 6, {
    near: { x: 31, y: 31 },
    body: [C.TOUGH, C.TOUGH, C.TOUGH, C.TOUGH, C.MOVE, C.MOVE, C.MOVE, C.MOVE, C.ATTACK, C.ATTACK, C.ATTACK, C.ATTACK]
  });

  console.log(`[scenario] under-attack: RCL7 base (3 towers) vs ${raiders.length} raiders`);
  return { rooms: [room], bots: { bot } };
};
