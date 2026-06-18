"use strict";
/*
 * A mid-game RCL3 room that still has its base to build out. Unlike `full-base`
 * (everything already placed), this hands the bot an empty footprint at the RCL
 * where the interesting construction unlocks: extensions (10 allowed at RCL3),
 * source containers (CONTAINER_MIN_RCL=3), and roads (ROAD_PLAN_MIN_RCL=3).
 *
 * Use this to watch the *construction + logistics* loop the bootstrap scenario
 * can't reach in a reasonable tick budget: BasePlanner places sites, the Build
 * job staffs workers onto them, extensions get built and filled, miners sit on
 * the new source containers, and the economy specializes — all while the
 * controller keeps climbing. Starts with a small generalist workforce so the
 * build loop has labor on tick 1 instead of waiting out a spawn ramp.
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

  // Jump the controller to RCL3 (where containers + roads + extensions unlock)
  // but leave the base unbuilt — no extensions, no containers, no roads.
  await W.setController(server, room, bot.id, 3);

  // A few generalists so the Build/Harvest/Haul/Upgrade jobs have labor at once.
  const C = server.constants;
  const body = [C.WORK, C.CARRY, C.MOVE];
  const spots = [
    { x: 24, y: 24 },
    { x: 26, y: 24 },
    { x: 24, y: 26 },
    { x: 26, y: 26 },
    { x: 23, y: 25 }
  ];
  for (let i = 0; i < spots.length; i++) {
    await W.addCreep(server, room, spots[i].x, spots[i].y, bot.id, body, {
      name: `bot_seed${i}`,
      store: { energy: 0 }
    });
  }

  console.log(`[scenario] growth: RCL3 room, empty footprint, ${spots.length} seed generalists`);
  return { rooms: [room], bots: { bot } };
};
