import { TaskKind } from "./TaskKind";
import { HarvestTaskData } from "./TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";

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
    constructor(data: HarvestTaskData) {
        super(data);
        this.data = data;
    }

    public isStillValid(): boolean {
        return true;
    }

    public score(creep: Creep): number {
        return 0;
    }

    public nextAction(creep: Creep): Action | null {
        return null;
    }
}
