import { TaskKind } from "./TaskKind";
import { TransferTaskData } from "./TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { TransferAction } from "actions/TransferAction";
import { CreepState } from "creeps/CreepState";
import { findBestEnergyTask } from "./NeedEnergyPrereq";

export function transferTaskName(structure: AnyStoreStructure): string {
    return "Transfer-" + structure.pos.roomName + "-" + structure.id;
}

export function createtransferTaskData(constructionSite: AnyStoreStructure): TransferTaskData {
    return {
        id: transferTaskName(constructionSite),
        kind: TaskKind.TRANSFER,
        room: constructionSite.pos.roomName,
        assignedCreeps: [],
        structureId: constructionSite.id
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

    public override score(creep: Creep): number {
        return 0;
    }

    public override nextAction(creepState: CreepState): Action | null {
        if (!this.structure) {
            this.data.assignedCreeps = [];
            creepState.memory.taskId = undefined;

            return null;
        }

        // TODO: change this to function to determine if we have energy or not
        if (creepState.creep.store.getUsedCapacity(RESOURCE_ENERGY) > 50) {
            return new TransferAction(this.structure);
        }

        return findBestEnergyTask(creepState);
    }
}
