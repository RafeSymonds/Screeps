import * as AbstractTask from "tasks/abstract_task";
export function processDeadCreeps() {
    for (const name in Memory.creeps) {
        if (!(name in Game.creeps)) {
            // process dead creep
            let creepID = global.creepNames[name];

            let creepInfo = global.creepAssignedTasks[creepID];
            if (!creepInfo) {
                continue;
            }

            creepInfo.tasks.forEach(taskInfo => {
                global.roomMemory[taskInfo.roomName].tasks[taskInfo.taskID].task.removeCreep(creepID);
            });

            delete global.creepAssignedTasks[creepID];
            delete global.creepNames[name];
            delete Memory.creeps[name];
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
