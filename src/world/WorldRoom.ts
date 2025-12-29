import { tryPreemptCreep } from "creeps/CreepController";
import { getCreepMemory } from "creeps/CreepMemory";
import { CreepState } from "creeps/CreepState";

export class WorldRoom {
    room: Room;
    myCreeps: CreepState[];

    constructor(room: Room, myCreeps: Creep[]) {
        this.room = room;

        const creepsInRoom = myCreeps.filter(creep => creep.memory.ownerRoom === room.name);
        this.myCreeps = creepsInRoom.map(creep => new CreepState(creep, getCreepMemory(creep.name)));
        this.myCreeps.forEach(creepState => tryPreemptCreep(creepState));
    }
}
