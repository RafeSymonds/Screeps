import * as CreepManager from "./Tasks/generalTask"
import * as GeneralTask from './Tasks/generalTask'


export function creepAction(creep: Creep, room: Room)
{
    if (!creep.memory.taskID || creep.memory.taskID.length == 0)
    {
        return;
    }

    let shiftCount: number = 0;

    while (shiftCount < creep.memory.taskID.length)
    {
        let taskID: string = creep.memory.taskID[shiftCount];
        let task: GeneralTask.Task | null = global.roomMemory[room.name].tasks[taskID];
        if (!task || !task.creeps.has(creep.name))
        {
            shiftCount++;
            continue;
        }
        task.processCreepAction(creep);
        break;
    }

    creep.memory.taskID = creep.memory.taskID.slice(shiftCount);

}
