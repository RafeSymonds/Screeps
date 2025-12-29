import { tryPreemptCreep } from "creeps/CreepController";
import { getCreepMemory } from "creeps/CreepMemory";
import { CreepState } from "creeps/CreepState";

export class WorldRoom {
    room: Room;
    myCreeps: CreepState[];

    constructor(room: Room, myCreeps: CreepState[]) {
        this.room = room;

        this.myCreeps = myCreeps.filter(creep => creep.memory.ownerRoom === room.name);
        this.myCreeps.forEach(creepState => tryPreemptCreep(creepState));
    }
}
