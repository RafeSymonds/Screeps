import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";
import { moveTo } from "creeps/CreepController";

export class ClaimAction extends Action {
    controller: StructureController;

    constructor(controller: StructureController) {
        super();
        this.controller = controller;
    }

    public override perform(creepState: CreepState): void {
        const creep = creepState.creep;
        const result = creep.claimController(this.controller);

        if (result === ERR_NOT_IN_RANGE) {
            moveTo(creepState, this.controller);
        } else if (result === ERR_GCL_NOT_ENOUGH) {
            // Can't claim — try to reserve instead
            const reserveResult = creep.reserveController(this.controller);

            if (reserveResult === ERR_NOT_IN_RANGE) {
                moveTo(creepState, this.controller);
            }
        }
    }
}
