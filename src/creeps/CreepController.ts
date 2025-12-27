import { World } from "world/World";
import { CreepState } from "./CreepState";
import { EnergyTarget } from "rooms/ResourceManagement";
import { CollectAction } from "actions/CollectionAction";

export function performCreepActions(world: World) {
    for (const [, room] of world.rooms) {
        for (const creepState of room.myCreeps) {
            if (creepState.memory.energyTargetId) {
                let energyTarget = Game.getObjectById(creepState.memory.energyTargetId);

                if (energyTarget) {
                    let action = new CollectAction(energyTarget);
                    action.perform(creepState);
                } else {
                    creepState.memory.energyTargetId = undefined;
                }
            } else {
                creepState.perform(world.taskManager);
            }
        }
    }
}

export function assignCreepEnegyPickup(creep: CreepState, energyTarget: EnergyTarget) {
    creep.memory.energyTargetId = energyTarget.id;
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
