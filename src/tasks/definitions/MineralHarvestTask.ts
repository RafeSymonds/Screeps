import { TaskKind } from "../core/TaskKind";
import { MineralHarvestTaskData } from "../core/TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { MineralHarvestAction } from "actions/MineralHarvestAction";
import { TransferAction } from "actions/TransferAction";
import { CreepState } from "creeps/CreepState";
import { countBodyParts, hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";

export function mineralHarvestTaskName(mineral: Mineral): string {
    return "mineralHarvest-" + mineral.pos.roomName + "-" + mineral.id;
}

export function createMineralHarvestTaskData(mineral: Mineral, extractor?: StructureExtractor): MineralHarvestTaskData {
    return {
        id: mineralHarvestTaskName(mineral),
        kind: TaskKind.MINERAL_HARVEST,
        targetRoom: mineral.pos.roomName,
        assignedCreeps: [],
        targetId: mineral.id,
        extractorId: extractor?.id
    };
}

export class MineralHarvestTask extends Task<MineralHarvestTaskData> {
    mineral: Mineral | null;
    extractor: StructureExtractor | null;

    constructor(data: MineralHarvestTaskData) {
        super(data);
        this.data = data;
        this.mineral = Game.getObjectById(data.targetId);
        this.extractor = data.extractorId ? Game.getObjectById(data.extractorId) : null;
    }

    public override isStillValid(): boolean {
        if (!this.mineral) return false;
        if (this.mineral.mineralAmount <= 0) return false;
        const extractor =
            this.extractor ??
            this.mineral.pos.findInRange(FIND_MY_STRUCTURES, 2).find(s => s.structureType === STRUCTURE_EXTRACTOR);
        return extractor !== null && extractor !== undefined;
    }

    public override canPerformTask(creepState: CreepState, _world: World): boolean {
        return hasBodyPart(creepState.creep, WORK) && countBodyParts(creepState.creep, CARRY) >= 1;
    }

    protected override taskIsFull(): boolean {
        return this.data.assignedCreeps.length >= 1;
    }

    public override score(creep: Creep): number {
        if (!this.mineral) {
            return -Infinity;
        }

        return -100 - creep.pos.getRangeTo(this.mineral);
    }

    public override nextAction(
        creepState: CreepState,
        _resourceManager: ResourceManager,
        _world: World
    ): Action | null {
        if (!this.mineral) {
            creepState.memory.taskId = undefined;
            return null;
        }

        if (hasBodyPart(creepState.creep, CARRY) && creepState.creep.store.getFreeCapacity() === 0) {
            const mineralType = this.mineral.mineralType;
            const targets = (creepState.creep.pos.findInRange(FIND_MY_STRUCTURES, 3) as Structure[]).filter(s => {
                const type = s.structureType as string;
                if (
                    type !== STRUCTURE_SPAWN &&
                    type !== STRUCTURE_EXTENSION &&
                    type !== STRUCTURE_STORAGE &&
                    type !== STRUCTURE_CONTAINER
                ) {
                    return false;
                }
                const store = (s as any).store;
                return store && store.getFreeCapacity(mineralType) > 0;
            });

            if (targets.length > 0) {
                const target = targets[0] as
                    | StructureSpawn
                    | StructureExtension
                    | StructureStorage
                    | StructureContainer;
                return new TransferAction(target);
            }
        }

        return new MineralHarvestAction(this.mineral);
    }

    public override validCreationSetup(): void {}

    public override requirements(): TaskRequirements {
        return {
            work: {
                parts: 1
            }
        };
    }
}
