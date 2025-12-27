import { TaskKind } from "./TaskKind";
import { UpgradeTaskData } from "./TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { UpgradeAction } from "actions/UpgradeAction";
import { CreepState } from "creeps/CreepState";
import { findBestEnergySource } from "rooms/ResourceManagement";

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

    public override score(creep: Creep): number {
        return 0;
    }

    public override nextAction(creep: CreepState): Action | null {
        if (!this.controller) {
            this.data.assignedCreeps = [];
            creep.memory.taskId = undefined;

            return null;
        }

        if (creep.creep.store.getUsedCapacity(RESOURCE_ENERGY) > 50) {
            return new UpgradeAction(this.controller);
        }

        let energySource = findBestEnergySource(creep.creep);

        if (energySource) {
            return;
        }

        return null;
    }
}
