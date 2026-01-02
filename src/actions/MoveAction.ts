import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";
import { moveTo } from "creeps/CreepController";

export class MoveAction extends Action {
    target: RoomPosition;

    constructor(target: RoomPosition) {
        super();
        this.target = target;
    }

    public override perform(creepState: CreepState): void {
        moveTo(creepState, this.target);
    }
}
