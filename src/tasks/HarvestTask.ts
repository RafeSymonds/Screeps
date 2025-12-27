import { TaskKind } from "./TaskKind";
import { HarvestTaskData } from "./TaskData";

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
