"use strict";
/*
 * Remote mining under threat: the remote-mining layout (built-out RCL4 home W1N1,
 * neutral 2-source W2N1 to adopt) but with hostile creeps camped in the remote that
 * EXPIRE (ageTime) partway through the run. Exercises the empire threat loop:
 *
 *   scout W2N1 -> intel records hostiles -> remote allocated but PAUSED (active:false,
 *   no jobs, no remote creeps march in) -> hostiles age out -> scout re-verifies on a
 *   later sweep -> remote reactivates -> miner/hauler spawn and mining begins.
 *
 * The hostiles are static (no driver code) — they don't chase the scout; they exist
 * to be seen. Their ageTime kills them around tick ~250 so a ~900-tick run covers
 * pause AND resume. See docs/architecture/EMPIRE.md (threat/abandon) and
 * sim/tests/remote-invader.test.js for the assertions.
 */
const W = require("./_world");

module.exports.setup = async (server, { modules }) => {
  await W.resetWorld(server);
  const C = server.constants;
  const home = "W1N1";
  const remote = "W2N1"; // the west neighbor of W1N1
  const center = { x: 25, y: 25 };

  await W.freshRoom(server, home);
  await W.addController(server, home, 25, 15, 0);
  await W.addSource(server, home, 10, 40);
  await W.addSource(server, home, 40, 40);

  // Neutral neighbor: unowned controller + two sources — the remote to adopt.
  await W.freshRoom(server, remote);
  await W.addController(server, remote, 25, 25, 0);
  await W.addSource(server, remote, 15, 20);
  await W.addSource(server, remote, 35, 30);

  const bot = await server.world.addBot({ username: "bot", room: home, x: center.x, y: center.y, modules });

  // Built-out RCL4 home with a workforce, so remote labor is fundable immediately.
  await W.fullBase(server, home, bot.id, { level: 4, center, creeps: 6 });

  // Hostiles camped in the remote, expiring around tick ~250: long enough that the
  // scout definitely sees them (pause), short enough that the run covers the resume.
  const gt = await server.world.gameTime;
  const raiders = await W.addUser(server, "Raiders");
  const body = [C.TOUGH, C.MOVE, C.ATTACK, C.ATTACK];
  await W.addCreep(server, remote, 20, 22, raiders, body, { name: "invader_0", ageTime: gt + 250 });
  await W.addCreep(server, remote, 30, 28, raiders, body, { name: "invader_1", ageTime: gt + 250 });

  // Real terrain around both rooms so cross-border pathfinding behaves like production.
  await W.seedSurroundingTerrain(server, [home, remote]);

  console.log(`[scenario] remote-invader: RCL4 ${home} + neutral ${remote} with 2 hostiles aging out ~tick 250`);
  return { rooms: [home, remote], bots: { bot } };
};
