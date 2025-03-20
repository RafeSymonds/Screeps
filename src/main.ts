import { ErrorMapper } from "utils/ErrorMapper";
import * as CreepManager from "creep_manager";
import * as TaskScheduler from "task_scheduler";
import * as AbstractTask from "tasks/abstract_task";
import * as Spawner from "spawner";

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
        uuid: number;
        log: any;
    }

    // actual creep memory. Persistent Memory
    interface CreepMemory {
        role: number;
    }

    interface TaskDetails {
        taskID: string;
        roomName: string;
    }

    interface CreepTaskDetails {
        tasks: TaskDetails[];
        workAmountLeft: number;
    }
    var creepAssignedTasks: { [creepID: Id<Creep>]: CreepTaskDetails };

    interface TaskInfo {
        task: AbstractTask.TaskClassType;
        roomName: string;
    }

    interface RoomMemory {
        tasks: { [taskID: string]: TaskInfo };

        energyLocations: { [taskId: string]: AbstractTask.TaskClassType };
    }
    var roomMemory: { [roomName: string]: RoomMemory };

    var pendingCreepNames: string[];

    // roomName, taskID
    var tasksNeedingRefresh: [string, string][];

    var creepNames: { [creepName: string]: Id<Creep> };
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
    const initialCPU = Game.cpu.getUsed();
    // console.log("Initial:", Game.cpu.getUsed());
    const gameRooms: [string, Room][] = Object.entries(Game.rooms);

    if (!global.roomMemory) {
        global.creepAssignedTasks = {};
        global.roomMemory = {};
        global.pendingCreepNames = [];
        global.creepNames = {};
        global.tasksNeedingRefresh = [];

        gameRooms.forEach(([roomName, room]) => {
            global.roomMemory[roomName] = {
                tasks: {},
                energyLocations: {}
            };

            TaskScheduler.setUpTasks(room);
        });

        Object.values(Game.creeps).forEach(creep => {
            global.creepAssignedTasks[creep.id] = { tasks: [], workAmountLeft: creep.store.getUsedCapacity() };
            global.creepNames[creep.name] = creep.id;
        });
    }
    // console.log("After global room check:", Game.cpu.getUsed()-initialCPU);

    global.pendingCreepNames.forEach(name => {
        let creep = Game.creeps[name];
        global.creepAssignedTasks[creep.id] = { tasks: [], workAmountLeft: 0 };
        global.creepNames[name] = creep.id;
    });
    global.pendingCreepNames.length = 0;
    global.tasksNeedingRefresh.forEach(([roomName, taskID]) => {
        let taskInfo = global.roomMemory[roomName].tasks[taskID];
        if (taskInfo) {
            taskInfo.task.updateValueLeft();
        }
    });
    global.tasksNeedingRefresh.length = 0;

    // console.log("Prior to processing dead creeps:", Game.cpu.getUsed()-initialCPU);

    CreepManager.processDeadCreeps();

    // console.log("Prior to assigning:", Game.cpu.getUsed()-initialCPU);

    gameRooms.forEach(([roomName, room]) => {
        Spawner.spawnWorker(room);
        if (global.roomMemory[roomName]) {
            TaskScheduler.assignCreeps(room);
        }
    });
    // console.log("After assigning:", Game.cpu.getUsed()-initialCPU);

    Object.values(Game.creeps).forEach(creep => {
        CreepManager.creepAction(creep);
    });

    console.log("CPU usage:", Game.cpu.getUsed() - initialCPU);
});
