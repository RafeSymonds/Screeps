import { World } from "world/World";
import { AnyTask, Task } from "./Task";
import { TaskManager } from "./TaskManager";

function isCreepFree(creep: Creep, taskManager: TaskManager): boolean {
    return creep.memory.taskId === undefined || !taskManager.tasks.has(creep.memory.taskId);
}

export function assignCreeps(world: World) {
    for (const [, room] of world.rooms) {
        for (const creep of room.myCreeps) {
            if (!isCreepFree(creep.creep, world.taskManager)) {
                continue;
            }

            console.log(room.tasks, room.tasks.size);

            for (const taskId of room.tasks) {
                const task = world.taskManager.get(taskId);

                console.log("lk;jasdfj;klsaf", task, taskId);

                if (task) {
                    creep.memory.taskId = task.id();
                    task.assignCreep(creep.creep);
                }
            }
        }
    }
}
