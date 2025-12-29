import { TaskKind } from "../core/TaskKind";
import { DeliverTaskData } from "../core/TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { TransferAction } from "actions/TransferAction";
import { CreepState } from "creeps/CreepState";
import { findBestEnergyTask } from "../requirements/EnergyRequirement";
import { hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { creepNeedsEnergy } from "creeps/CreepController";
import { TaskRequirements } from "tasks/core/TaskRequirements";

export function deliverTaskName(structure: AnyStoreStructure): string {
    return "Transfer-" + structure.pos.roomName + "-" + structure.id;
}

export function createDeliverTaskData(structure: AnyStoreStructure): DeliverTaskData {
    return {
        id: deliverTaskName(structure),
        kind: TaskKind.DELIVER,
        targetRoom: structure.pos.roomName,
        assignedCreeps: [],
        structureId: structure.id
    };
}

export class DeliverTask extends Task<DeliverTaskData> {
    structure: AnyStoreStructure | null;

    constructor(data: DeliverTaskData) {
        super(data);
        this.data = data;

        this.structure = Game.getObjectById(data.structureId);
    }

    public override isStillValid(): boolean {
        return this.structure !== null;
    }

    public canPerformTask(creepState: CreepState): boolean {
        return hasBodyPart(creepState.creep, CARRY);
    }

    public taskIsFull(): boolean {
        return this.structure === undefined || this.structure?.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
    }

    public override score(creep: Creep): number {
        if (!this.structure) {
            return -Infinity;
        }

        return -100 - creep.pos.getRangeTo(this.structure) + this.priority() * 5;
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager): Action | null {
        if (!this.structure || this.structure.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            console.log("clearing trafer task", this.id());
            creepState.memory.taskId = undefined;
            return null;
        }

        // TODO: change this to function to determine if we have energy or not
        // TODO: change to be smarter. near by energy grab otherwise build
        if (creepNeedsEnergy(creepState)) {
            return findBestEnergyTask(creepState, this.structure, resourceManager);
        }

        return new TransferAction(this.structure);
    }

    public override validCreationSetup(): void {}

    public requirements(): TaskRequirements {
        const energyPerTick = 15;

        const distance = 8;
        const roundTrip = distance * 2;

        return {
            carry: Math.ceil((energyPerTick * roundTrip) / 50)
        };
    }

    private priority(): number {
        switch (this.structure?.structureType) {
            case STRUCTURE_SPAWN:
                return 10; // game cannot progress without this

            case STRUCTURE_EXTENSION:
                return 9; // spawn throughput

            case STRUCTURE_TOWER:
                return 8; // defense > economy when empty

            case STRUCTURE_CONTAINER:
                return 4; // local buffer, lower than consumers

            case STRUCTURE_STORAGE:
                return 2; // global buffer, lowest urgency

            default:
                return 0;
        }
    }
}
