import { tryPreemptCreep } from "creeps/CreepController";
import { CreepState } from "creeps/CreepState";
import { getDefaultRoomMemory } from "rooms/RoomMemory";
import { TaskManager } from "tasks/core/TaskManager";

export class WorldRoom {
    room: Room;
    myCreeps: CreepState[];

    constructor(room: Room, myCreeps: CreepState[], taskManager: TaskManager) {
        this.room = room;

        this.myCreeps = myCreeps.filter(creep => creep.memory.ownerRoom === room.name);
        this.myCreeps.forEach(creepState => tryPreemptCreep(creepState, taskManager));

        if (room.name in Memory.rooms) {
            room.memory = getDefaultRoomMemory();
        }
    }
}
