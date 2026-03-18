import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";
import { moveTo } from "creeps/CreepController";

export class RepairAction extends Action {
    target: Structure;

    constructor(target: Structure) {
        super();
        this.target = target;
    }

    public override perform(creepState: CreepState): void {
        const creep = creepState.creep;

        if (creep.repair(this.target) === ERR_NOT_IN_RANGE) {
            moveTo(creepState, this.target);
        }
    }
}
