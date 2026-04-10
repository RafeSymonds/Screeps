import { TaskKind } from "../core/TaskKind";
import { RepairTaskData } from "../core/TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { RepairAction } from "actions/RepairAction";
import { CreepState } from "creeps/CreepState";
import { findBestEnergyTask } from "../requirements/EnergyRequirement";
import { hasBodyPart, isDedicatedHaulerCreep, isDedicatedMinerCreep, isWorkerCreep } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { creepNeedsEnergy } from "creeps/CreepController";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";
import { scaledRoleBias } from "tasks/core/RoleAffinity";

export function repairTaskName(structure: Structure): string {
    return "repair-" + structure.pos.roomName + "-" + structure.id;
}

export function createRepairTaskData(structure: Structure): RepairTaskData {
    return {
        id: repairTaskName(structure),
        kind: TaskKind.REPAIR,
        targetRoom: structure.pos.roomName,
        assignedCreeps: [],
        targetId: structure.id
    };
}

export class RepairTask extends Task<RepairTaskData> {
    structure: Structure | null;

    constructor(data: RepairTaskData) {
        super(data);
        this.data = data;

        this.structure = Game.getObjectById(data.targetId);
    }

    public override isStillValid(): boolean {
        return this.structure !== null && this.structure.hits < this.structure.hitsMax;
    }

    public canPerformTask(creepState: CreepState, world: World): boolean {
        if (!hasBodyPart(creepState.creep, WORK) || !hasBodyPart(creepState.creep, CARRY)) {
            return false;
        }

        const hasEnergy = creepState.creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
        if (hasEnergy) {
            return true;
        }

        return world.resourceManager.roomHasEnoughEnergy(creepState, creepState.creep.room.name);
    }

    protected override taskIsFull(): boolean {
        return this.data.assignedCreeps.length >= 1; // Limit to 1 repairer per structure for now
    }

    public override score(creep: Creep): number {
        if (!this.structure) {
            return -Infinity;
        }

        const baseRoleBias = isWorkerCreep(creep)
            ? 50
            : isDedicatedMinerCreep(creep)
              ? -80
              : isDedicatedHaulerCreep(creep)
                ? -140
                : 0;
        const roleBias = scaledRoleBias(creep.memory.ownerRoom, baseRoleBias);
        return this.priority() * 5 - creep.pos.getRangeTo(this.structure) + roleBias;
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager, world: World): Action | null {
        if (!this.structure) {
            creepState.memory.taskId = undefined;

            return null;
        }

        if (creepNeedsEnergy(creepState, world)) {
            return findBestEnergyTask(creepState, null, resourceManager);
        }

        return new RepairAction(this.structure);
    }

    public override validCreationSetup(): void {}

    public override requirements(): TaskRequirements {
        return {
            work: {
                parts: 1
            }
        };
    }

    public override assignCreep(creepState: CreepState, world: World): void {
        super.assignCreep(creepState, world);

        if (creepNeedsEnergy(creepState, world)) {
            findBestEnergyTask(creepState, null, world.resourceManager);
        }
    }

    private priority(): number {
        if (!this.structure) return 0;

        const s = this.structure;

        if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) {
            const hpRatio = s.hits / s.hitsMax;
            if (hpRatio < 0.3) return 10;
            if (hpRatio < 0.5) return 7;
            if (hpRatio < 0.7) return 4;
            return 0;
        }

        const hpRatio = s.hits / s.hitsMax;
        if (hpRatio < 0.2) return 10;
        if (hpRatio < 0.5) return 5;
        if (hpRatio < 0.8) return 2;

        return 0;
    }
}
