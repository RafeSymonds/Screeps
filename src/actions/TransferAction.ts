import { Action } from "./Action";

export class TransferAction extends Action {
    structure: AnyStoreStructure;

    constructor(structure: AnyStoreStructure) {
        super();
        this.structure = structure;
    }

    public override perform(creep: Creep): void {
        if (creep.transfer(this.structure, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(this.structure);
        }
    }
}
