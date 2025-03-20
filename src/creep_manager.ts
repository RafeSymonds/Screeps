import * as AbstractTask from "tasks/abstract_task";
export function processDeadCreeps() {
    for (const name in Memory.creeps) {
        if (!(name in Game.creeps)) {
            // process dead creep
            let creep = Game.creeps[name];

            global.creepAssignedTasks[creep.id].tasks.forEach(taskInfo => {
                global.roomMemory[taskInfo.roomName].tasks[taskInfo.taskID].task.removeCreep(creep.id);
            });
        }
    }
}

export function creepAction(creep: Creep) {
    let creepTaskInfo = global.creepAssignedTasks[creep.id];

    if (!creepTaskInfo) {
        return;
    }

    let tasks = creepTaskInfo.tasks;

    if (tasks.length === 0) {
        return;
    }

    let shiftCount: number = 0;

    while (shiftCount < tasks.length) {
        let task = tasks[shiftCount];

        let taskInfo = global.roomMemory[task.roomName].tasks[task.taskID];

        if (!taskInfo || !taskInfo.task.creeps.has(creep.id)) {
            shiftCount++;
            continue;
        }
        taskInfo.task.processCreepAction(creep);
        break;
    }

    global.creepAssignedTasks[creep.id].tasks = tasks.slice(shiftCount);
}
