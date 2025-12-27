import { World } from "world/World";
import { CreepState } from "./CreepState";
import { EnergyTarget } from "rooms/ResourceManagement";

export function performCreepActions(world: World) {
    for (const [, room] of world.rooms) {
        for (const creep of room.myCreeps) {
            creep.perform(world.taskManager);
        }
    }
}

export function assignCreepEnegyPickup(creep: CreepState, energyTarget: EnergyTarget) {
    creep.memory.energyTarget = energyTarget;
}

export function tryOrMove<T extends RoomObject>(
    creep: Creep,
    target: T,
    action: (creep: Creep, target: T) => ScreepsReturnCode
): boolean {
    const result = action(creep, target);

    if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(target);
        return true; // we moved
    }

    return false; // no move
}
