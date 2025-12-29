import { tryPreemptCreep } from "creeps/CreepController";
import { getCreepMemory } from "creeps/CreepMemory";
import { CreepState } from "creeps/CreepState";
import { TaskIdSet } from "tasks/definitions/Task";
import { TaskManager } from "tasks/core/TaskManager";
import { filterMapToArray } from "utils/MapUtils";

export class WorldRoom {
    room: Room;
    myCreeps: CreepState[];

    tasks: TaskIdSet;

    constructor(room: Room, myCreeps: Creep[], taskManager: TaskManager) {
        this.room = room;

        const creepsInRoom = myCreeps.filter(creep => creep.memory.ownerRoom === room.name);
        this.myCreeps = creepsInRoom.map(creep => new CreepState(creep, getCreepMemory(creep.name)));
        this.myCreeps.forEach(creepState => tryPreemptCreep(creepState));

        this.tasks = new Set(
            filterMapToArray(taskManager.tasks, task => task.data.room === room.name).map(task => task.id())
        );
    }
}
