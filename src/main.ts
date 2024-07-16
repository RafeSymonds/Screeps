import { ErrorMapper } from "utils/ErrorMapper";

import * as GeneralTask from "./Tasks/generalTask";
import * as TaskScheduler from "./taskScheduler";
import * as spawner from "./spawner";
import * as buildBase from "./buildBase";
import { memoize } from "lodash";
import { globalAgent } from "http";
import { privateEncrypt } from "crypto";

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
        role: GeneralTask.TaskType;
        taskID: string[];
        workAmountLeft: number;
        roomName: string;
    }

    interface RoomMemory
    {
        tasks: { [taskId: string]: GeneralTask.Task };
        // position, amount of engery left, on ground
        energyLocations: { [taskId: string]: number };
        workerCreepCount: number;
        transporterCreepCount: number;
        harvesterCreepCount: number;
        harvesterLimit: number;
        baseCenter: [number, number];
    }


    var roomMemory: { [roomName: string]: RoomMemory };

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
                baseCenter: [0, 0],
                harvesterLimit: 0,
            }
            //priorities.setUpTasks(room);
            //priorities.assignAllCreeps(room);
        });
        // need to recreate memory
    }
    //console.log(`Current game tick is ${Game.time}`);
    // Automatically delete memory of missing creeps
    for (const name in Memory.creeps)
    {
        if (!(name in Game.creeps))
        {
            GeneralTask.deleteCreepMemory(name);
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

            TaskScheduler.setUpTasks(room);

            //priorities.setUpTasks(room);

            let allCreeps = room.find(FIND_MY_CREEPS);

            var creepNeedingTasks: Creep[] = [];

            allCreeps.forEach(creep =>
            {
                if (creep.memory.taskID && creep.memory.taskID.length == 0)
                {
                    creepNeedingTasks.push(creep);
                }
            });



            let tasks: { [taskId: string]: GeneralTask.Task } = global.roomMemory[room.name].tasks;

            TaskScheduler.assignCreeps(room, tasks, creepNeedingTasks);


            for (let id in global.roomMemory[roomName].tasks)
            {
                global.roomMemory[roomName].tasks[id].processCreepActions();
            }

            spawner.spawnCreepInRoom(room);
        }
        room.memory = global.roomMemory[roomName];
    });
    //console.log(Game.cpu.getUsed());
});
