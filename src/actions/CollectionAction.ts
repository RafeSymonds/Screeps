import { Action } from "./Action";

export class CollectAction extends Action {
    target: Resource | Structure | Tombstone | Ruin;

    constructor(target: Resource) {
        super();
        this.target = target;
    }

    public override perform(creep: Creep): void {
        if (this.target instanceof Resource) {
            if (creep.pickup(this.target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(this.target);
            }
        } else {
            if (creep.withdraw(this.target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(this.target);
            }
        }
    }
}
