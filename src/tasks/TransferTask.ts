import { TaskKind } from "./TaskKind";
import { TransferTaskData } from "./TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { TransferAction } from "actions/TransferAction";
import { CreepState } from "creeps/CreepState";
import { findBestEnergyTask } from "./NeedEnergyPrereq";
import { hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";

export function transferTaskName(structure: AnyStoreStructure): string {
    return "Transfer-" + structure.pos.roomName + "-" + structure.id;
}

export function createtransferTaskData(structure: AnyStoreStructure): TransferTaskData {
    return {
        id: transferTaskName(structure),
        kind: TaskKind.TRANSFER,
        room: structure.pos.roomName,
        assignedCreeps: [],
        structureId: structure.id
    };
}

export class TransferTask extends Task<TransferTaskData> {
    structure: AnyStoreStructure | null;

    constructor(data: TransferTaskData) {
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

        return -100 - creep.pos.getRangeTo(this.structure);
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager): Action | null {
        if (!this.structure || this.structure.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            console.log("clearing trafer task", this.id());
            creepState.memory.taskId = undefined;
            return null;
        }

        // TODO: change this to function to determine if we have energy or not
        // TODO: change to be smarter. near by energy grab otherwise build
        if (
            creepState.creep.store.getUsedCapacity(RESOURCE_ENERGY) >
            creepState.creep.store.getCapacity(RESOURCE_ENERGY) / 2
        ) {
            return new TransferAction(this.structure);
        }

        return findBestEnergyTask(creepState, resourceManager);
    }
}
