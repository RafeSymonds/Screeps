import { Action } from "./Action";

export class BuildAction extends Action {
    target: ConstructionSite;

    constructor(target: ConstructionSite) {
        super();
        this.target = target;
    }

    public override perform(creep: Creep): void {
        if (creep.build(this.target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(this.target);
        }
    }
}
