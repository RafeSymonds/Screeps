import { World } from "world/World";
import { AnyTask } from "../definitions/Task";
import { TaskManager } from "./TaskManager";

function isCreepFree(creepMemory: CreepMemory, taskManager: TaskManager): boolean {
    return creepMemory.taskId === undefined || !taskManager.tasks.has(creepMemory.taskId);
}

export function assignCreeps(world: World) {
    for (const [, room] of world.rooms) {
        for (const creepState of room.myCreeps) {
            if (creepState.creep.spawning) {
                continue;
            }

            if (!isCreepFree(creepState.memory, world.taskManager)) {
                continue;
            }

            let bestTask: AnyTask | undefined = undefined;
            let bestScore = -Infinity;

            for (const taskId of room.tasks) {
                const task = world.taskManager.get(taskId);

                if (task && task.canPerformTask(creepState) && !task.taskIsFull()) {
                    let score = task.score(creepState.creep);

                    if (score > bestScore) {
                        bestTask = task;
                        bestScore = score;
                    }
                }
            }

            if (bestTask) {
                creepState.memory = { taskId: bestTask.id(), taskTicks: 0, energyTargetId: undefined, working: true };

                bestTask.assignCreep(creepState.creep);

                console.log("[Task Assigned] creep ", creepState.creep.name, " with task ", bestTask.id());
            }
        }
    }
}
