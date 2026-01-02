import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";
import { moveTo } from "creeps/CreepController";

export class UpgradeAction extends Action {
    target: StructureController;

    constructor(target: StructureController) {
        super();
        this.target = target;
    }

    public override perform(creepState: CreepState): void {
        const creep = creepState.creep;

        if (creep.upgradeController(this.target) === ERR_NOT_IN_RANGE) {
            moveTo(creepState, this.target);
        }
    }
}
