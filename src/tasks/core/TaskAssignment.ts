import { World } from "world/World";
import { AnyTask } from "../definitions/Task";
import { TaskManager } from "./TaskManager";
import { updateCreepMemoryForTask } from "creeps/CreepController";
import { filterMapToArray, mapToArray } from "utils/MapUtils";

function isCreepFree(creepMemory: CreepMemory, taskManager: TaskManager): boolean {
    return creepMemory.taskId === undefined || !taskManager.tasks.has(creepMemory.taskId);
}

export function assignCreeps(world: World) {
    for (const [, worldRoom] of world.rooms) {
        console.log("trying to assign creep in room", worldRoom.myCreeps.length);
        for (const creepState of worldRoom.myCreeps) {
            if (creepState.creep.spawning) {
                continue;
            }

            if (!isCreepFree(creepState.memory, world.taskManager)) {
                continue;
            }

            let bestTask: AnyTask | undefined = undefined;
            let bestScore = -Infinity;

            const tasks = filterMapToArray(world.taskManager.tasks, task => task.roomCanConsiderTask(worldRoom.room));

            for (const task of tasks) {
                if (task && task.canPerformTask(creepState) && !task.taskIsFull()) {
                    let score = task.score(creepState.creep);

                    if (score > bestScore) {
                        bestTask = task;
                        bestScore = score;
                    }
                }
            }

            if (bestTask) {
                bestTask.assignCreep(creepState);

                updateCreepMemoryForTask(creepState, bestTask);

                console.log("[Task Assigned] creep ", creepState.creep.name, " with task ", bestTask.id());
            }
        }
    }
}
