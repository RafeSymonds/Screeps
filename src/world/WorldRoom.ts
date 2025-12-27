import { getCreepMemory } from "creeps/CreepMemory";
import { CreepState } from "creeps/CreepState";
import { TaskIdSet } from "tasks/Task";
import { TaskManager } from "tasks/TaskManager";
import { filterMapToArray } from "utils/MapUtils";

export class WorldRoom {
    room: Room;
    myCreeps: CreepState[];

    tasks: TaskIdSet;

    // sources: Source[];
    // structures: Structure[];
    // constructionSites: ConstructionSite[];

    constructor(room: Room, myCreeps: Creep[], taskManager: TaskManager) {
        this.room = room;

        const creepsInRoom = myCreeps.filter(creep => creep.room.name === room.name);
        this.myCreeps = creepsInRoom.map(creep => new CreepState(creep, getCreepMemory(creep.name)));

        this.tasks = new Set(
            filterMapToArray(taskManager.tasks, task => task.data.room === room.name).map(task => task.id())
        );
    }
}
