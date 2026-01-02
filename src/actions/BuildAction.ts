import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";
import { moveTo } from "creeps/CreepController";

export class BuildAction extends Action {
    target: ConstructionSite;

    constructor(target: ConstructionSite) {
        super();
        this.target = target;
    }

    public override perform(creepState: CreepState): void {
        const creep = creepState.creep;

        if (creep.build(this.target) === ERR_NOT_IN_RANGE) {
            moveTo(creepState, this.target);
        }
    }
}
