import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";
import { moveTo } from "creeps/CreepController";

export class PickupAction extends Action {
    target: Resource;

    constructor(target: Resource) {
        super();
        this.target = target;
    }

    public override perform(creepState: CreepState): void {
        const result = creepState.creep.pickup(this.target);

        if (result === ERR_NOT_IN_RANGE) {
            moveTo(creepState, this.target);
        }
    }
}
