import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";
import { moveTo } from "creeps/CreepController";

export class MineralHarvestAction extends Action {
    mineral: Mineral;

    constructor(mineral: Mineral) {
        super();
        this.mineral = mineral;
    }

    public override perform(creepState: CreepState): void {
        const creep = creepState.creep;

        if (creep.harvest(this.mineral) === ERR_NOT_IN_RANGE) {
            moveTo(creepState, this.mineral);
            return;
        }

        const mineralType = this.mineral.mineralType;
        if (creep.store.getUsedCapacity(mineralType) > 0 && creep.store.getFreeCapacity() > 0) {
            const container = creep.pos
                .findInRange(FIND_STRUCTURES, 1)
                .find(
                    (s): s is StructureContainer =>
                        s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity(mineralType) > 0
                );

            if (container) {
                creep.transfer(container, mineralType);
            }
        }
    }
}
