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
        }
    }
}
