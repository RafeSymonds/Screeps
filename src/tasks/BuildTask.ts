import { TaskKind } from "./TaskKind";
import { BuildTaskData } from "./TaskData";
import { Task } from "./Task";

export function buildTaskName(constructionSite: ConstructionSite): string {
    return "build-" + constructionSite.pos.roomName + "-" + constructionSite.id;
}

export function createBuildTaskData(constructionSite: ConstructionSite): BuildTaskData {
    return {
        id: buildTaskName(constructionSite),
        kind: TaskKind.BUILD,
        room: constructionSite.pos.roomName,
        assignedAgents: [],
        targetId: constructionSite.id
    };
}

export class BuildTask extends Task<BuildTaskData> {}
