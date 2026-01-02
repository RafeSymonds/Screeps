import { World } from "world/World";
import { AnyTask } from "../definitions/Task";
import { TaskManager } from "./TaskManager";
import { updateCreepMemoryForTask } from "creeps/CreepController";

function isCreepFree(creepMemory: CreepMemory, taskManager: TaskManager): boolean {
    return creepMemory.taskId === undefined || !taskManager.tasks.has(creepMemory.taskId);
}

export function assignCreeps(world: World) {
    for (const [, worldRoom] of world.rooms) {
        for (const creepState of worldRoom.myCreeps) {
            if (creepState.creep.spawning) {
                continue;
            }

            if (!isCreepFree(creepState.memory, world.taskManager)) {
                continue;
            }

            let bestTask: AnyTask | undefined = undefined;
            let bestScore = -Infinity;

            for (const task of world.taskManager.getTasksForRoom(worldRoom.room)) {
                if (task && task.canPerformTask(creepState, world) && !task.taskIsFull()) {
                    let score = task.score(creepState.creep);

                    if (score > bestScore) {
                        bestTask = task;
                        bestScore = score;
                    }
                }
            }

            if (bestTask) {
                bestTask.assignCreep(creepState, world);

                updateCreepMemoryForTask(creepState, bestTask);

                console.log("[Task Assigned] creep ", creepState.creep.name, " with task ", bestTask.id());
            }
        }
    }
}
