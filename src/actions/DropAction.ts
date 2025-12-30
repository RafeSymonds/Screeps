import { Action } from "./Action";
import { CreepState } from "creeps/CreepState";

export class DropAction extends Action {
    private target: RoomPosition;
    private resource: ResourceConstant;

    constructor(target: RoomPosition, resource: ResourceConstant = RESOURCE_ENERGY) {
        super();
        this.target = target;
        this.resource = resource;
    }

    public override perform(creepState: CreepState): void {
        const creep = creepState.creep;
        const range = creep.pos.getRangeTo(this.target);

        if (range > 2) {
            creep.moveTo(this.target);
            return;
        }

        creep.drop(this.resource);
    }
}
