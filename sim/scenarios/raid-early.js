"use strict";
/*
 * The tower-less raid: a small RCL2 base (5 full extensions, a few generalists)
 * with two weak-but-armed raiders camped nearby. There are no towers at RCL2, so
 * the ONLY thing standing between the raiders and the base is defense's rung 2 —
 * spawned [MOVE,ATTACK] defenders. Exercises the ladder end-to-end where
 * under-attack (RCL7, 3 towers) never reaches past rung 1.
 *
 * The raiders are static (no driver code) — they exist to be killed; the gate
 * asserts a defender spawns, the hostiles die, and the economy resumes.
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
  await W.fullBase(server, room, bot.id, { level: 2, center, creeps: 4 });

  const enemy = await W.addUser(server, "Raiders");
  const C = server.constants;
  const raiders = await W.addHostiles(server, room, enemy, 2, {
    near: { x: 31, y: 31 },
    body: [C.TOUGH, C.TOUGH, C.MOVE, C.ATTACK]
  });

  console.log(`[scenario] raid-early: RCL2 base, no towers, ${raiders.length} raiders — defenders must carry it`);
  return { rooms: [room], bots: { bot } };
};
