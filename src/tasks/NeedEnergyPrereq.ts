import { CollectAction } from "actions/CollectionAction";
import { assignCreepEnegyPickup } from "creeps/CreepController";
import { CreepState } from "creeps/CreepState";
import { findBestEnergySource } from "rooms/ResourceManagement";

export function findBestEnergyTask(creepState: CreepState) {
    let energySource = findBestEnergySource(creepState.creep);

    if (energySource) {
        assignCreepEnegyPickup(creepState, energySource);
        return new CollectAction(energySource);
    }

    return null;
}
