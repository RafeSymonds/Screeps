import { ErrorMapper } from "utils/ErrorMapper";

import * as priorities from "./priorities";
import * as creepLogic from "./creepLogic";
import * as spawner from "./spawner";
import * as buildBase from "./buildBase";
import { memoize } from "lodash";

declare global
{
  /*
    Example types, expand on these or remove them and add your own.
    Note: Values, properties defined here do no fully *exist* by this type definiton alone.
          You must also give them an implemention if you would like to use them. (ex. actually setting a `role` property in a Creeps memory)

    Types added in this `global` block are in an ambient, global context. This is needed because `main.ts` is a module file (uses import or export).
    Interfaces matching on name from @types/screeps will be merged. This is how you can extend the 'built-in' interfaces from @types/screeps.
  */
  // Memory extension samples
  interface Memory
  {
    uuid: number;
    log: any;
  }

  interface CreepMemory
  {
    role: priorities.TaskType;
    taskID: string[];
    workAmountLeft: number;
    roomName: string;
  }

  interface RoomMemory
  {
    tasks: { [taskId: string]: priorities.Task };
    // position, amount of engery left, on ground
    energyLocations: { [taskId: string]: number };
    workerCreepCount: number;
    transporterCreepCount: number;
    harvesterCreepCount: number;
    sourceContainerTasks: { [taskId: string]: priorities.CollectEnergyTask };
    baseCenter: [number, number];
  }
}



// Syntax for adding proprties to `global` (ex "global.log")
namespace NodeJS
{
  interface Global
  {
    log: any;
  }
}


// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() =>
{
  //console.log(`Current game tick is ${Game.time}`);
  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps)
  {
    if (!(name in Game.creeps))
    {
      let creepMemory: CreepMemory = Memory.creeps[name];
      let room: Room = Game.rooms[creepMemory.roomName];
      if (creepMemory.role === priorities.TaskType.work)
      {
        room.memory.workerCreepCount -= 1;
      }
      else if (Memory.creeps[name].role === priorities.TaskType.transport)
      {
        room.memory.transporterCreepCount -= 1;
      }
      else if (Memory.creeps[name].role === priorities.TaskType.harvest)
      {
        room.memory.harvesterCreepCount -= 1;
      }

      for (let taskIndex = 0; taskIndex < creepMemory.taskID.length; taskIndex++)
      {
        priorities.Task.updateValueLeftFromDeath(room.memory.tasks[creepMemory.taskID[taskIndex]], creepMemory, room);
      }

      delete Memory.creeps[name];

    }
  }

  const gameRooms: [string, Room][] = Object.entries(Game.rooms);

  gameRooms.forEach(([roomName, room]) =>
  {
    if (room.controller?.my && !room.memory.tasks)
    {
      room.memory.tasks = {};
      room.memory.energyLocations = {};
      room.memory.workerCreepCount = 0;
      room.memory.transporterCreepCount = 0;
      room.memory.harvesterCreepCount = 0;
      room.memory.sourceContainerTasks = {};
      room.memory.baseCenter = [0, 0];
      let spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);
      if (spawns.length > 0)
      {
        room.memory.baseCenter = [spawns[0].pos.x, spawns[0].pos.y + 2];
      }
    }

    //everyr 40 ticks plan base
    if (Game.time % 40 === 0)
    {
      buildBase.buildBase(room);
    }





    priorities.createTasks(room);
    let creeps: Creep[] = room.find(FIND_MY_CREEPS);
    let tasks: { [taskId: string]: priorities.Task } = room.memory.tasks;

    if (Game.time % 20 === 0)
    {
      priorities.updatePriorities(room);
    }


    spawner.spawnCreepInRoom(room);

    creepLogic.assignCreeps(room, tasks, creeps.filter(creep => { return creep.memory.taskID && creep.memory.taskID.length === 0; }));
    creeps.forEach(creep =>
    {

      if (creep.memory.taskID && creep.memory.taskID.length > 0)
      {
        creepLogic.processCreepActions(creep, tasks[creep.memory.taskID[0]], room);
      }
      else
      {
        creepLogic.processCreepActions(creep, null, room);
      }
    });
  });
  //console.log(Game.cpu.getUsed());
});
