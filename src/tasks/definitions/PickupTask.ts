import { TaskKind } from "../core/TaskKind";
import { PickupTaskData } from "../core/TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { PickupAction } from "actions/PickupAction";
import { TransferAction } from "actions/TransferAction";
import { CreepState } from "creeps/CreepState";
import { hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";

export function pickupTaskName(resource: Resource): string {
    return "pickup-" + resource.pos.roomName + "-" + resource.id;
}

export function createPickupTaskData(resource: Resource): PickupTaskData {
    return {
        id: pickupTaskName(resource),
        kind: TaskKind.PICKUP,
        targetRoom: resource.pos.roomName,
        assignedCreeps: [],
        targetId: resource.id
    };
}

export class PickupTask extends Task<PickupTaskData> {
    resource: Resource | null;

    constructor(data: PickupTaskData) {
        super(data);
        this.data = data;
        this.resource = Game.getObjectById(data.targetId);
    }

    public override isStillValid(): boolean {
        if (!this.resource) return false;
        const amount = this.resource.amount;
        return amount > 0;
    }

    public override canPerformTask(creepState: CreepState, _world: World): boolean {
        return hasBodyPart(creepState.creep, CARRY);
    }

    protected override taskIsFull(): boolean {
        return this.data.assignedCreeps.length >= 1;
    }

    public override score(creep: Creep): number {
        if (!this.resource) {
            return -Infinity;
        }

        const dist = creep.pos.getRangeTo(this.resource);
        const energyBonus = this.resource.amount > 100 ? 50 : 0;

        return -100 - dist + energyBonus;
    }

    public override nextAction(
        creepState: CreepState,
        _resourceManager: ResourceManager,
        _world: World
    ): Action | null {
        if (!this.resource) {
            creepState.memory.taskId = undefined;
            return null;
        }

        if (creepState.creep.store.getFreeCapacity() === 0) {
            const target = creepState.creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
                filter: (s): s is StructureSpawn | StructureExtension | StructureStorage =>
                    (s.structureType === STRUCTURE_SPAWN ||
                        s.structureType === STRUCTURE_EXTENSION ||
                        s.structureType === STRUCTURE_STORAGE) &&
                    s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });

            if (target) {
                return new TransferAction(target);
            }
        }

        return new PickupAction(this.resource);
    }

    public override validCreationSetup(): void {}

    public override requirements(): TaskRequirements {
        return {
            carry: {
                parts: 1
            }
        };
    }
}
