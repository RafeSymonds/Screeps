import { TaskData } from "tasks/TaskData";
import { ErrorMapper } from "utils/ErrorMapper";
import { World } from "world/World";
import { setupRoomMemory } from "memory/RoomMemory";
import { TaskManager } from "tasks/TaskManager";

declare global {
    /*
    Example types, expand on these or remove them and add your own.
    Note: Values, properties defined here do no fully *exist* by this type definiton alone.
          You must also give them an implemention if you would like to use them. (ex. actually setting a `role` property in a Creeps memory)

    Types added in this `global` block are in an ambient, global context. This is needed because `main.ts` is a module file (uses import or export).
    Interfaces matching on name from @types/screeps will be merged. This is how you can extend the 'built-in' interfaces from @types/screeps.
  */
    // Memory extension samples
    interface Memory {
        tasks: TaskData[];
        creepsData: CreepMemory[];
    }

    interface CreepMemory {
        taskId?: string;
        taskTicks: number;
    }

    interface RoomMemory {}
}

// Syntax for adding proprties to `global` (ex "global.log")
declare namespace NodeJS {
    interface Global {
        log: any;
    }
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() => {
    console.log("Initial CPU Usage:", Game.cpu.getUsed());

    if (!Memory.tasks) {
        Memory.tasks = [];
        Memory.creepsData;
    }

    let taskManager = new TaskManager();

    let rooms = Object.values(Game.rooms);

    rooms.forEach(room => setupRoomMemory(room, taskManager));

    let myCreeps = Object.values(Game.creeps);

    let world = new World(rooms, myCreeps, taskManager);

    Memory.creepsData = world.getCreepData();
    Memory.tasks = world.getTaskData();
});
