import { TaskKind } from "../core/TaskKind";
import { BuildTaskData } from "../core/TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { BuildAction } from "actions/BuildAction";
import { CreepState } from "creeps/CreepState";
import { findBestEnergyTask } from "../requirements/EnergyRequirement";
import { hasBodyPart, isDedicatedHaulerCreep, isDedicatedMinerCreep, isWorkerCreep } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { creepNeedsEnergy } from "creeps/CreepController";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";
import { scaledRoleBias } from "tasks/core/RoleAffinity";

export function buildTaskName(constructionSite: ConstructionSite): string {
    return "build-" + constructionSite.pos.roomName + "-" + constructionSite.id;
}

export function createBuildTaskData(constructionSite: ConstructionSite): BuildTaskData {
    return {
        id: buildTaskName(constructionSite),
        kind: TaskKind.BUILD,
        targetRoom: constructionSite.pos.roomName,
        assignedCreeps: [],
        constructionId: constructionSite.id
    };
}

export class BuildTask extends Task<BuildTaskData> {
    constructionSite: ConstructionSite | null;

    constructor(data: BuildTaskData) {
        super(data);
        this.data = data;

        this.constructionSite = Game.getObjectById(data.constructionId);
    }

    public override isStillValid(): boolean {
        return this.constructionSite !== null;
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
        return false;
    }

    public override score(creep: Creep): number {
        if (!this.constructionSite) {
            return -Infinity;
        }

        const baseRoleBias = isWorkerCreep(creep)
            ? 60
            : isDedicatedMinerCreep(creep)
              ? -80
              : isDedicatedHaulerCreep(creep)
                ? -140
                : 0;
        const roleBias = scaledRoleBias(creep.memory.ownerRoom, baseRoleBias);
        return this.priority() * 5 - creep.pos.getRangeTo(this.constructionSite) + roleBias;
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager, world: World): Action | null {
        if (!this.constructionSite) {
            creepState.memory.taskId = undefined;

            return null;
        }

        if (creepNeedsEnergy(creepState, world)) {
            return findBestEnergyTask(creepState, null, resourceManager);
        }

        return new BuildAction(this.constructionSite);
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

        // check to see if creep needs energy and if so just find best energy now and reserve it
        if (creepNeedsEnergy(creepState, world)) {
            findBestEnergyTask(creepState, null, world.resourceManager);
        }
    }

    private priority(): number {
        switch (this.constructionSite?.structureType) {
            case STRUCTURE_CONTAINER:
                return 4;
            case STRUCTURE_EXTENSION:
                return 7;
            case STRUCTURE_SPAWN:
                return 10;
            case STRUCTURE_STORAGE:
                return 2;
            case STRUCTURE_TOWER:
                return 4;
            default:
                return 0;
        }
    }
}
