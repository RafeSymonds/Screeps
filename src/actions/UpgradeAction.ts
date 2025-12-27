import { Action } from "./Action";

export class UpgradeAction extends Action {
    target: StructureController;

    constructor(target: StructureController) {
        super();
        this.target = target;
    }

    public override perform(creep: Creep): void {
        if (creep.upgradeController(this.target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(this.target);
        }
    }
}
