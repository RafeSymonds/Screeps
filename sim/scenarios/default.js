"use strict";
/*
 * Default scenario: a single fresh RCL1 room, the way a new player starts.
 *
 *   - all-plains terrain (creeps can move anywhere)
 *   - a controller and two sources
 *   - addBot() claims the controller (RCL1) and drops Spawn1 with 300 energy
 *
 * This is the canonical "can the bot bootstrap an economy from scratch?" world:
 * watch it spawn its floor of workers, harvest, fill the spawn, and upgrade.
 *
 * A scenario exports `setup(server, { TerrainMatrix, modules })` and returns
 * `{ rooms: string[], bots: { <name>: <UserEmitter> } }`.
 */
module.exports.setup = async (server, { TerrainMatrix, modules }) => {
  await server.world.reset();

  const room = "W1N1";
  await server.world.addRoom(room);
  await server.world.setTerrain(room, new TerrainMatrix()); // empty => all plains

  await server.world.addRoomObject(room, "controller", 25, 18, { level: 0 });
  await server.world.addRoomObject(room, "source", 10, 40, {
    energy: 3000,
    energyCapacity: 3000,
    ticksToRegeneration: 300
  });
  await server.world.addRoomObject(room, "source", 40, 40, {
    energy: 3000,
    energyCapacity: 3000,
    ticksToRegeneration: 300
  });

  const bot = await server.world.addBot({ username: "bot", room, x: 25, y: 25, modules });

  return { rooms: [room], bots: { bot } };
};
