import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";
import { EnergyTarget } from "rooms/RoomEnergyState";

export class CollectAction extends Action {
    target: EnergyTarget;

    constructor(target: EnergyTarget) {
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

    public override perform(creepState: CreepState): void {
        const moved = this.tryAndMove(creepState.creep);

        if (!moved) {
            creepState.memory.energyTargetId = undefined;
        }
    }
}
