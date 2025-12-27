import { Action } from "./Action";

export class HarvestAction extends Action {
    source: Source;

    constructor(source: Source) {
        super();
        this.source = source;
    }

    public override perform(creep: Creep): void {
        if (creep.harvest(this.source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(this.source);
        }
    }
}
