import { TaskKind } from "./TaskKind";
import { UpgradeTaskData } from "./TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { UpgradeAction } from "actions/UpgradeAction";
import { CreepState } from "creeps/CreepState";
import { findBestEnergyTask } from "./NeedEnergyPrereq";
import { hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { creepNeedsEnergy } from "creeps/CreepController";

export function upgradeTaskName(controller: StructureController): string {
    return "upgrade-" + controller.pos.roomName + "-" + controller.id;
}

export function createUpgradeTaskData(controller: StructureController): UpgradeTaskData {
    return {
        id: upgradeTaskName(controller),
        kind: TaskKind.UPGRADE,
        room: controller.pos.roomName,
        assignedCreeps: [],
        controllerId: controller.id
    };
}

export class UpgradeTask extends Task<UpgradeTaskData> {
    controller: StructureController | null;

    constructor(data: UpgradeTaskData) {
        super(data);
        this.data = data;

        this.controller = Game.getObjectById(data.controllerId);
    }

    public override isStillValid(): boolean {
        return this.controller !== null;
    }

    public canPerformTask(creepState: CreepState): boolean {
        return hasBodyPart(creepState.creep, WORK) && hasBodyPart(creepState.creep, CARRY);
    }

    public taskIsFull(): boolean {
        return false;
    }

    public override score(creep: Creep): number {
        return -10;
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager): Action | null {
        if (!this.controller) {
            creepState.memory.taskId = undefined;
            return null;
        }

        if (creepNeedsEnergy(creepState)) {
            return findBestEnergyTask(creepState, null, resourceManager);
        }

        return new UpgradeAction(this.controller);
    }

    public override validCreationSetup(): void {}
}
