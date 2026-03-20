import { TaskKind } from "../core/TaskKind";
import { UpgradeTaskData } from "../core/TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { UpgradeAction } from "actions/UpgradeAction";
import { CreepState } from "creeps/CreepState";
import { findBestEnergyTask } from "../requirements/EnergyRequirement";
import { hasBodyPart, isDedicatedHaulerCreep, isDedicatedMinerCreep, isWorkerCreep } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { creepNeedsEnergy } from "creeps/CreepController";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";
import { scaledRoleBias } from "tasks/core/RoleAffinity";

export function upgradeTaskName(controller: StructureController): string {
    return "upgrade-" + controller.pos.roomName + "-" + controller.id;
}

export function createUpgradeTaskData(controller: StructureController, desiredParts?: number): UpgradeTaskData {
    return {
        id: upgradeTaskName(controller),
        kind: TaskKind.UPGRADE,
        targetRoom: controller.pos.roomName,
        assignedCreeps: [],
        controllerId: controller.id,
        desiredParts
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

    public canPerformTask(creepState: CreepState, world: World): boolean {
        if (!hasBodyPart(creepState.creep, WORK) || !hasBodyPart(creepState.creep, CARRY)) {
            return false;
        }

        const hasEnergy = creepState.creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
        if (hasEnergy) {
            return true;
        }

        // If we have no energy, we can only take the task if the room has some to give
        return world.resourceManager.roomHasEnoughEnergy(creepState, creepState.creep.room.name);
    }

    protected taskIsFull(): boolean {
        return false;
    }

    public override score(creep: Creep): number {
        const baseRoleBias = isWorkerCreep(creep)
            ? 40
            : isDedicatedMinerCreep(creep)
              ? -70
              : isDedicatedHaulerCreep(creep)
                ? -120
                : 0;
        const roleBias = scaledRoleBias(creep.memory.ownerRoom, baseRoleBias);
        return -10 + roleBias;
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager, world: World): Action | null {
        if (!this.controller) {
            creepState.memory.taskId = undefined;
            return null;
        }

        if (creepNeedsEnergy(creepState, world)) {
            return findBestEnergyTask(creepState, null, resourceManager);
        }

        return new UpgradeAction(this.controller);
    }

    public override validCreationSetup(): void {}

    public override requirements(): TaskRequirements {
        return {
            work: {
                parts: this.data.desiredParts ?? 15
            }
        };
    }

    public override assignCreep(creepState: CreepState, world: World): void {
        super.assignCreep(creepState, world);

        // check to see if creep needs energy and if so just find best energy now and reserve it
        if (creepNeedsEnergy(creepState, world)) {
            findBestEnergyTask(creepState, null, world.resourceManager);
        }
    }
}
