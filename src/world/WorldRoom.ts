import { CreepState } from "creeps/CreepState";

export class WorldRoom {
    room: Room;
    myCreepsInRoom: CreepState[];

    // sources: Source[];
    // structures: Structure[];
    // constructionSites: ConstructionSite[];

    constructor(room: Room, myCreeps: Creep[]) {
        this.room = room;

        const creepsInRoom = myCreeps.filter(creep => creep.room.name === room.name);
        const creepMemory = Memory.creeps;
        this.myCreepsInRoom = creepsInRoom.map(creep => new CreepState(creep, creepMemory[creep.id]));
    }
}
