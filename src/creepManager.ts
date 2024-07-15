import * as GeneralTask from "./Tasks/generalTask"

export function deleteCreepMemory(creepID: Id<Creep>)
{
    let creepMemory: CreepMemory = Memory.creeps[name];
    let room: Room = Game.rooms[creepMemory.roomName];
    console.log("deleting creep memory in ", room)
    if (room)
    {
        console.log("valid room");
        if (creepMemory.role === GeneralTask.TaskType.work)
        {
            global.roomMemory[room.name].workerCreepCount -= 1;
        }
        else if (creepMemory.role === GeneralTask.TaskType.transport)
        {
            global.roomMemory[room.name].transporterCreepCount -= 1;
        }
        else if (creepMemory.role === GeneralTask.TaskType.harvest)
        {
            global.roomMemory[room.name].harvesterCreepCount -= 1;
        }

        for (let taskIndex = 0; taskIndex < creepMemory.taskID.length; taskIndex++)
        {
            global.roomMemory[room.name].tasks[creepMemory.taskID[taskIndex]].tryToRemoveDeadCreeps(name);
            global.roomMemory[room.name].tasks[creepMemory.taskID[taskIndex]].updateValueLeft();
        }
    }
    delete Memory.creeps[name];
}
}
