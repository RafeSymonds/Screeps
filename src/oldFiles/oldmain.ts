/*
import { ErrorMapper } from "utils/ErrorMapper";

import * as priorities from "./prioritiesNew";
import * as creepLogic from "./creepLogic";
import * as spawner from "./spawner";
import * as buildBase from "./buildBase";
import { memoize } from "lodash";
import { globalAgent } from "http";
import { privateEncrypt } from "crypto";

declare global
{


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
    harvesterLimit: number;
    sourceContainerTasks: { [taskId: string]: priorities.CollectEnergyTask };
    baseCenter: [number, number];
  }
  var roomMemory: { [roomName: string]: RoomMemory };

  var roomTasks: { [roomName: string]: { [taskId: string]: priorities.Task } };

}

// Syntax for adding proprties to `global` (ex "global.log")
declare namespace NodeJS
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
  const gameRooms: [string, Room][] = Object.entries(Game.rooms);

  if (global.roomMemory == null)
  {
    global.roomMemory = {};
    gameRooms.forEach(([roomName, room]) =>
    {
      global.roomMemory[roomName] =
      {
        tasks: {},
        energyLocations: {},
        workerCreepCount: 0,
        transporterCreepCount: 0,
        harvesterCreepCount: 0,
        sourceContainerTasks: {},
        baseCenter: [0, 0],
        harvesterLimit: 0,
      }
      priorities.setUpTasks(room);
      priorities.assignAllCreeps(room);
    });
    // need to recreate memory
  }
  //console.log(`Current game tick is ${Game.time}`);
  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps)
  {
    if (!(name in Game.creeps))
    {
      let creepMemory: CreepMemory = Memory.creeps[name];
      let room: Room = Game.rooms[creepMemory.roomName];
      console.log("deleting creep memory in ", room)
      if (room)
      {
        console.log("valid room");
        if (creepMemory.role === priorities.TaskType.work)
        {
          global.roomMemory[room.name].workerCreepCount -= 1;
        }
        else if (creepMemory.role === priorities.TaskType.transport)
        {
          global.roomMemory[room.name].transporterCreepCount -= 1;
        }
        else if (creepMemory.role === priorities.TaskType.harvest)
        {
          global.roomMemory[room.name].harvesterCreepCount -= 1;
        }

        for (let taskIndex = 0; taskIndex < creepMemory.taskID.length; taskIndex++)
        {
          console.log("removing creep from task")
          global.roomMemory[room.name].tasks[creepMemory.taskID[taskIndex]].updateValueLeftFromDeath(creepMemory);
        }
      }
      delete Memory.creeps[name];
    }
  }




  gameRooms.forEach(([roomName, room]) =>
  {
    if (global.roomMemory[roomName])
    {
      //everyr 40 ticks plan base
      if (Game.time % 40 === 0)
      {
        buildBase.buildBase(room);
      }





      priorities.setUpTasks(room);

      let creeps: Creep[] = room.find(FIND_MY_CREEPS);
      let tasks: { [taskId: string]: priorities.Task } = global.roomMemory[room.name].tasks;

      if (Game.time % 20 === 0)
      {
        priorities.updatePriorities(room);
      }

      creepLogic.assignCreeps(room, tasks, creeps.filter(creep => { return creep.memory.taskID && creep.memory.taskID.length === 0; }));
      creeps.forEach(creep =>
      {

        if (creep.memory.taskID && creep.memory.taskID.length > 0)
        {
          let taskID: string = creep.memory.taskID[0];
          if (taskID in global.roomMemory[room.name].tasks)
          {
            creepLogic.processCreepActions(creep, tasks[taskID], room);
          }
          else
          {
            creep.memory.taskID.pop();
          }
        }
      });
      spawner.spawnCreepInRoom(room);
    }
    room.memory = global.roomMemory[roomName];
  });
  //console.log(Game.cpu.getUsed());
});

*/
