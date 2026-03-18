import { TaskKind } from "../core/TaskKind";
import { HarvestTaskData } from "../core/TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { HarvestAction } from "actions/HarvestAction";
import { TransferAction } from "actions/TransferAction";
import { CreepState } from "creeps/CreepState";
import { countBodyParts, hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";

export function harvestTaskName(source: Source): string {
    return "harvest-" + source.room.name + "-" + source.id;
}

export function createHarvestTaskData(source: Source): HarvestTaskData {
    let harvestSpots = 9;

    const terrain = source.room.lookForAtArea(
        LOOK_TERRAIN,
        source.pos.y - 1,
        source.pos.x - 1,
        source.pos.y + 1,
        source.pos.x + 1,
        true
    );
    terrain.forEach(terrainItem => {
        if (terrainItem.terrain === "wall") {
            harvestSpots -= 1;
        }
    });

    return {
        id: harvestTaskName(source),
        kind: TaskKind.HARVEST,
        targetRoom: source.room.name,
        assignedCreeps: [],
        targetId: source.id,
        maxSpots: harvestSpots
    };
}

export class HarvestTask extends Task<HarvestTaskData> {
    source: Source | null;

    constructor(data: HarvestTaskData) {
        super(data);
        this.data = data;
        this.source = Game.getObjectById(data.targetId);
    }

    public override isStillValid(): boolean {
        return true;
    }

    public override canPerformTask(creepState: CreepState, _world: World): boolean {
        // Only dedicated miners (1 CARRY or less) — workers should upgrade/build
        return hasBodyPart(creepState.creep, WORK) && countBodyParts(creepState.creep, CARRY) <= 1;
    }

    protected override taskIsFull(): boolean {
        const workParts = this.data.assignedCreeps.reduce((total, creepInfo) => {
            const creep = Game.getObjectById(creepInfo[0]);

            if (creep) {
                total += countBodyParts(creep, WORK);
            }

            return total;
        }, 0);

        return (
            workParts >= 5 ||
            this.data.assignedCreeps.length >= 5 ||
            this.data.assignedCreeps.length >= this.data.maxSpots
        );
    }

    public override score(creep: Creep): number {
        if (!this.source) {
            return -Infinity;
        }

        return -100 - creep.pos.getRangeTo(this.source);
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager): Action | null {
        if (!this.source) {
            creepState.memory.taskId = undefined;
            return null;
        }

        // Workers with CARRY: deliver energy when full, then return to harvest
        if (hasBodyPart(creepState.creep, CARRY) && creepState.creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            const target = creepState.creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
                filter: (s): s is StructureSpawn | StructureExtension =>
                    (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
                    s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });

            if (target) {
                return new TransferAction(target);
            }
        }

        return new HarvestAction(this.source);
    }

    public override validCreationSetup(): void {
        if (this.source) {
            this.source.room.memory.numHarvestSpots += this.data.maxSpots;
        }
    }

    public override requirements(): TaskRequirements {
        return {
            mine: {
                parts: 5,
                creeps: Math.max(1, this.data.maxSpots)
            }
        };
    }
}
