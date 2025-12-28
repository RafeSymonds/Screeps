import { World } from "world/World";
import { AnyTask, Task } from "./Task";
import { TaskManager } from "./TaskManager";

function isCreepFree(creepMemory: CreepMemory, taskManager: TaskManager): boolean {
    return creepMemory.taskId === undefined || !taskManager.tasks.has(creepMemory.taskId);
}

export function assignCreeps(world: World) {
    for (const [, room] of world.rooms) {
        for (const creepState of room.myCreeps) {
            if (!isCreepFree(creepState.memory, world.taskManager)) {
                continue;
            }

            for (const taskId of room.tasks) {
                const task = world.taskManager.get(taskId);
                if (creepState.creep.name.startsWith("h") && task) {
                    console.log("here", creepState.creep.name, task.id(), task?.canPerformTask(creepState));
                }
            }

            for (const taskId of room.tasks) {
                const task = world.taskManager.get(taskId);

                if (task && task.canPerformTask(creepState) && !task.taskIsFull()) {
                    creepState.memory.taskId = task.id();
                    task.assignCreep(creepState.creep);

                    break;
                }
            }
        }
    }
}
