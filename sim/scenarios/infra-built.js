"use strict";
/*
 * The post-infrastructure era's starting line: RCL2 (default's geometry) with the
 * 5 extensions, both source containers, and the controller container already
 * standing, plus a seeded workforce. Exists so the fast gate can prove "the
 * upgrader throttle releases and the container economy sustains its rate" in
 * ~800 ticks instead of building the infrastructure first (~5000 ticks).
 *
 * Container positions honor the executors' adjacency rules: source containers
 * adjacent to their sources; the controller container within range 3 of the
 * controller (layout adopts it as controllerContainer via incorporation).
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

  // 5 extensions on core-adjacent checkerboard tiles (energy full → cap 550).
  const ext = [[23, 23], [27, 23], [23, 27], [27, 27], [21, 25]];
  for (const [x, y] of ext) {
    await W.addStructure(server, room, "extension", x, y, { user: bot.id, level: 2 });
  }
  // Source containers on mining seats; controller container at range 2.
  await W.addStructure(server, room, "container", 11, 39, { energy: 1000 });
  await W.addStructure(server, room, "container", 39, 39, { energy: 1000 });
  await W.addStructure(server, room, "container", 25, 20, { energy: 1000 });

  const C = server.constants;
  const body = [C.WORK, C.WORK, C.CARRY, C.MOVE]; // real 2-WORK bodies: 1-WORK seeds drip 2 e/t and piles never reach minPickup (probe-measured)
  const spots = [
    [24, 24], [26, 24], [24, 26], [26, 26], [22, 25], [28, 25],
  ];
  for (let i = 0; i < spots.length; i++) {
    await W.addCreep(server, room, spots[i][0], spots[i][1], bot.id, body, {
      name: `bot_seed${i}`,
      store: { energy: 0 }
    });
  }

  console.log(`[scenario] infra-built: RCL2 + 5 ext + 3 containers, ${spots.length} seed generalists`);
  return { rooms: [room], bots: { bot } };
};
