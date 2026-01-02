import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";
import { EnergyTarget } from "rooms/RoomEnergyState";
import { creepStoreFullPercentage, moveTo } from "creeps/CreepController";

export class CollectAction extends Action {
    target: EnergyTarget;

    constructor(target: EnergyTarget) {
        super();
        this.target = target;
    }

    /*
     * Return true if we move
     * */
    private tryAndMove(creepState: CreepState): boolean {
        if (this.target instanceof Resource) {
            if (creepState.creep.pickup(this.target) === ERR_NOT_IN_RANGE) {
                moveTo(creepState, this.target);
                return true;
            }
        } else {
            if (creepState.creep.withdraw(this.target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveTo(creepState, this.target);
                return true;
            }
        }

        return false;
    }

    public override perform(creepState: CreepState): void {
        const moved = this.tryAndMove(creepState);

        if (!moved) {
            creepState.memory.energyTargetId = undefined;
        }
    }
}
