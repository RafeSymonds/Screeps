import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";
import { moveTo } from "creeps/CreepController";

export class HarvestAction extends Action {
    source: Source;

    constructor(source: Source) {
        super();
        this.source = source;
    }

    public override perform(creepState: CreepState): void {
        const creep = creepState.creep;

        if (creep.harvest(this.source) === ERR_NOT_IN_RANGE) {
            moveTo(creepState, this.source);
            return;
        }

        // If the miner has CARRY and energy, transfer to an adjacent link
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            const link = creep.pos.findInRange(FIND_MY_STRUCTURES, 1).find(
                (s): s is StructureLink =>
                    s.structureType === STRUCTURE_LINK &&
                    s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            );

            if (link) {
                creep.transfer(link, RESOURCE_ENERGY);
            }
        }
    }
}
