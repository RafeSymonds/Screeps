import { TaskData } from "tasks/TaskData";
import { ErrorMapper } from "utils/ErrorMapper";
import { World } from "world/World";
import { setupRoomMemory } from "rooms/RoomSetup";
import { TaskManager } from "tasks/TaskManager";
import { assignCreeps } from "tasks/TaskAssignment";
import { performCreepActions } from "creeps/CreepController";
import { runSpawning } from "spawner/Spawner";
import { EnergyTarget } from "rooms/ResourceManager";
import { getDefaultCreepMemory } from "creeps/CreepMemory";
import { runRelativeBasePlanner } from "basePlaner/BasePlans";

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
    }

    interface CreepMemory {
        taskId?: string;
        taskTicks: number;
        energyTargetId?: Id<EnergyTarget>;
        working: boolean;
    }

    interface RoomMemory {
        // early game max number of harvesters to spawn
        numHarvestSpots: number;
        anchorSpawnId?: Id<StructureSpawn>;
    }
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
    // console.log("Initial CPU Usage:", Game.cpu.getUsed());
    const startCpu = Game.cpu.getUsed();

    if (!Memory.tasks) {
        Memory.tasks = [];
    }

    if (!Memory.creeps) {
        Memory.creeps = {};
    }

    if (!Memory.rooms) {
        Memory.rooms = {};
    }

    let rooms = Object.values(Game.rooms);

    let taskManager = new TaskManager();

    // TODO: deal with dead creeps somewhere in here
    for (const name in Memory.creeps) {
        if (!(name in Game.creeps)) {
            // creep is dead
            const creepMemory = Memory.creeps[name];

            if (creepMemory.taskId) {
                const task = taskManager.get(creepMemory.taskId);
                task?.removeDeadCreep(name);
            }

            delete Memory.creeps[name];
        }
    }

    rooms.forEach(room => setupRoomMemory(room, taskManager));

    rooms.forEach(room => runRelativeBasePlanner(room));

    let myCreeps = Object.values(Game.creeps);

    for (const creep of myCreeps) {
        if (creep.memory === undefined) {
            creep.memory = getDefaultCreepMemory();
        }
    }

    let world = new World(rooms, myCreeps, taskManager);

    runSpawning(world);

    assignCreeps(world);
    performCreepActions(world);

    Memory.creeps = world.getCreepData();
    Memory.tasks = world.getTaskData();

    // console.log("Final CPU Usage:", Game.cpu.getUsed());
    console.log("Total CPU Usage: ", Game.cpu.getUsed() - startCpu);
});
