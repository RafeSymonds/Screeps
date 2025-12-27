import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";

export class UpgradeAction extends Action {
    target: StructureController;

    constructor(target: StructureController) {
        super();
        this.target = target;
    }

    public override perform(creepState: CreepState): void {
        const creep = creepState.creep;

        if (creep.upgradeController(this.target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(this.target);
        }
    }
}
