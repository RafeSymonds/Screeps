export function processDeadCreeps() {
    for (const name in Memory.creeps) {
        if (!(name in Game.creeps)) {
            // process dead creep
        }
    }
}

export function creepAction(creep: Creep) {
    let tasks = global.creepAssignedTasks[creep.id];

    if (!tasks || tasks.tasks.length === 0) {
        return;
    }

    let shiftCount: number = 0;

    while (shiftCount < tasks.tasks.length) {
        let taskID: string = creep.memory.taskID[shiftCount];

        // let task: GeneralTask.Task | null = global.roomMemory[room.name].tasks[taskID];
        // if (!task || !task.creeps.has(creep.name)) {
        //     shiftCount++;
        //     continue;
        // }
        // task.processCreepAction(creep);
        break;
    }

    creep.memory.taskID = creep.memory.taskID.slice(shiftCount);
}
