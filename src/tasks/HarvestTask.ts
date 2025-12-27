import { TaskKind } from "./TaskKind";
import { HarvestTaskData } from "./TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { HarvestAction } from "actions/HarvestAction";
import { CreepState } from "creeps/CreepState";
import { hasBodyPart } from "creeps/CreepUtils";

export function harvestTaskName(source: Source): string {
    return "harvest-" + source.room.name + "-" + source.id;
}

export function createHarvestTaskData(source: Source): HarvestTaskData {
    return {
        id: harvestTaskName(source),
        kind: TaskKind.HARVEST,
        room: source.room.name,
        assignedCreeps: [],
        targetId: source.id
    };
}

export class HarvestTask extends Task<HarvestTaskData> {
    source: Source | null;

    constructor(data: HarvestTaskData) {
        super(data);
        this.data = data;
        this.source = Game.getObjectById(data.targetId);
    }

    public isStillValid(): boolean {
        return true;
    }

    public canPerformTask(creepState: CreepState): boolean {
        return hasBodyPart(creepState.creep, WORK);
    }

    public score(creep: Creep): number {
        return 0;
    }

    public nextAction(creep: CreepState): Action | null {
        if (!this.source) {
            this.data.assignedCreeps = [];
            creep.memory.taskId = undefined;

            return null;
        }

        return new HarvestAction(this.source);
    }
}
