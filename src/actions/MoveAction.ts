import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";

export class MoveAction extends Action {
    target: RoomPosition;

    constructor(target: RoomPosition) {
        super();
        this.target = target;
    }

    public override perform(creepState: CreepState): void {
        creepState.creep.moveTo(this.target);
    }
}
