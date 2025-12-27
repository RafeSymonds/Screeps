import { CreepState } from "creeps/CreepState";
import { Task, TaskMap } from "tasks/Task";

export class WorldRoom {
    room: Room;
    myCreepsInRoom: CreepState[];

    tasks: TaskMap;

    // sources: Source[];
    // structures: Structure[];
    // constructionSites: ConstructionSite[];

    constructor(room: Room, myCreeps: Creep[], tasks: TaskMap) {
        this.room = room;

        const creepsInRoom = myCreeps.filter(creep => creep.room.name === room.name);
        const creepMemory = Memory.creeps;
        this.myCreepsInRoom = creepsInRoom.map(creep => new CreepState(creep, creepMemory[creep.id]));

        this.tasks = tasks;
    }
}
