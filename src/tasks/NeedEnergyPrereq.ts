import { CollectAction } from "actions/CollectionAction";
import { assignCreepEnegyPickup } from "creeps/CreepController";
import { CreepState } from "creeps/CreepState";
import { ResourceManager as ResourceManager } from "rooms/ResourceManager";

export function findBestEnergyTask(creepState: CreepState, resourceManager: ResourceManager) {
    let energySource = resourceManager.findBestEnergySource(creepState.creep);

    if (energySource) {
        assignCreepEnegyPickup(creepState, energySource);
        return new CollectAction(energySource);
    }

    return null;
}
