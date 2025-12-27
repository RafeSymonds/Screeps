import { tryOrMove } from "creeps/CreepController";
import { Action } from "./Action";

export class CollectAction extends Action {
    target: Resource | Structure | Tombstone | Ruin;

    constructor(target: Resource) {
        super();
        this.target = target;
    }

    /*
     * Return true if we move
     * */
    private tryAndMove(creep: Creep): boolean {
        if (this.target instanceof Resource) {
            if (creep.pickup(this.target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(this.target);
                return true;
            }
        } else {
            if (creep.withdraw(this.target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(this.target);
                return true;
            }
        }

        return false;
    }

    public override perform(creep: Creep): void {
        let moved = this.tryAndMove(creep);

        if (!moved) {
        }
    }
}
