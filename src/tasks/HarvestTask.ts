import { TaskKind } from "./TaskKind";
import { HarvestTaskData } from "./TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { HarvestAction } from "actions/HarvestAction";
import { CreepState } from "creeps/CreepState";
import { countBodyParts, hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";

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

    public override isStillValid(): boolean {
        return true;
    }

    public override canPerformTask(creepState: CreepState): boolean {
        return hasBodyPart(creepState.creep, WORK);
    }

    public override taskIsFull(): boolean {
        let workParts = this.data.assignedCreeps.reduce((total, creepId) => {
            const creep = Game.getObjectById(creepId);

            if (creep) {
                total += countBodyParts(creep, WORK);
            }

            return total;
        }, 0);

        return workParts < 5 && this.data.assignedCreeps.length < 5;
    }

    public override score(creep: Creep): number {
        return 0;
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager): Action | null {
        if (!this.source) {
            this.data.assignedCreeps = [];
            creepState.memory.taskId = undefined;

            return null;
        }

        return new HarvestAction(this.source);
    }
}
