import { CollectAction } from "actions/CollectionAction";
import { assignCreepEnegyPickup } from "creeps/CreepController";
import { CreepState } from "creeps/CreepState";
import { ResourceManager as ResourceManager } from "rooms/ResourceManager";

export function findBestEnergyTask(
    creepState: CreepState,
    destination: Structure | RoomPosition | null,
    resourceManager: ResourceManager
) {
    const energySource = resourceManager.findEnergyAndReserve(creepState.creep, destination);

    if (energySource) {
        assignCreepEnegyPickup(creepState, energySource);
        return new CollectAction(energySource);
    }

    return null;
}
