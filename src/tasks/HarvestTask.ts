import { TaskKind } from "./TaskKind";
import { HarvestTaskData } from "./TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";

export function harvestTaskName(source: Source): string {
    return "harvest-" + source.room.name + "-" + source.id;
}

function createHarvestTaskData(source: Source): HarvestTaskData {
    return {
        id: harvestTaskName(source),
        kind: TaskKind.HARVEST,
        room: source.room.name,
        assignedAgents: [],
        targetId: source.id
    };
}

export class HarvestTask extends Task {
    data: HarvestTaskData;

    constructor(data: HarvestTaskData) {
        super();
        this.data = data;
    }

    public isStillValid(): boolean {
        return true;
    }

    public score(creep: Creep): number {
        return 0;
    }

    public ready(creep: Creep): Action | null {
        return null;
    }
}
