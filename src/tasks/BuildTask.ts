import { TaskKind } from "./TaskKind";
import { BuildTaskData } from "./TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { TransferAction } from "actions/TransferAction";

export function buildTaskName(constructionSite: ConstructionSite): string {
    return "build-" + constructionSite.pos.roomName + "-" + constructionSite.id;
}

export function createBuildTaskData(constructionSite: ConstructionSite): BuildTaskData {
    return {
        id: buildTaskName(constructionSite),
        kind: TaskKind.BUILD,
        room: constructionSite.pos.roomName,
        assignedAgents: [],
        constructionId: constructionSite.id
    };
}

export class BuildTask extends Task {
    data: BuildTaskData;
    constructionSite: ConstructionSite | null;

    constructor(data: BuildTaskData) {
        super();
        this.data = data;

        this.constructionSite = Game.getObjectById(data.constructionId);
    }

    public isStillValid(): boolean {
        return this.constructionSite !== null;
    }

    public score(creep: Creep): number {
        return 0;
    }

    public ready(creep: Creep): Action | null {
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 50) {
            return null;
        }

        // TODO: change this to be collect resource
        return new TransferAction();
    }
}
