import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";
import { moveTo } from "creeps/CreepController";

export class TransferAction extends Action {
    structure: AnyStoreStructure;

    constructor(structure: AnyStoreStructure) {
        super();
        this.structure = structure;
    }

    public override perform(creepState: CreepState): void {
        const creep = creepState.creep;

        if (creep.transfer(this.structure, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            moveTo(creepState, this.structure);
        }
    }
}
