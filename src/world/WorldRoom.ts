import { CreepState } from "creeps/CreepState";
import { Task, TaskIdSet, TaskMap } from "tasks/Task";
import { filterMapToArray } from "utils/MapUtils";

export class WorldRoom {
    room: Room;
    myCreepsInRoom: CreepState[];

    tasks: TaskIdSet;

    // sources: Source[];
    // structures: Structure[];
    // constructionSites: ConstructionSite[];

    constructor(room: Room, myCreeps: Creep[], tasks: TaskMap) {
        this.room = room;

        const creepsInRoom = myCreeps.filter(creep => creep.room.name === room.name);
        const creepMemory = Memory.creeps;
        this.myCreepsInRoom = creepsInRoom.map(creep => new CreepState(creep, creepMemory[creep.id]));

        this.tasks = new Set(filterMapToArray(tasks, task => task.data.room === room.name));
    }
}
