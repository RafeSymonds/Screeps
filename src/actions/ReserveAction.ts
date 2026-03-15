import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";
import { moveTo } from "creeps/CreepController";
import { getMyUsername } from "utils/GameUtils";

export class ReserveAction extends Action {
    controller: StructureController;

    constructor(controller: StructureController) {
        super();
        this.controller = controller;
    }

    public override perform(creepState: CreepState): void {
        const creep = creepState.creep;

        // Attack enemy reservation first
        if (this.controller.reservation && this.controller.reservation.username !== getMyUsername()) {
            const result = creep.attackController(this.controller);
            if (result === ERR_NOT_IN_RANGE) {
                moveTo(creepState, this.controller);
            }
            return;
        }

        const result = creep.reserveController(this.controller);

        if (result === ERR_NOT_IN_RANGE) {
            moveTo(creepState, this.controller);
        }
    }
}
