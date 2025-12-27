import { TaskKind } from "./TaskKind";
import { BuildTaskData } from "./TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { CollectAction } from "actions/CollectionAction";
import { BuildAction } from "actions/BuildAction";

export function buildTaskName(constructionSite: ConstructionSite): string {
    return "build-" + constructionSite.pos.roomName + "-" + constructionSite.id;
}

export function createBuildTaskData(constructionSite: ConstructionSite): BuildTaskData {
    return {
        id: buildTaskName(constructionSite),
        kind: TaskKind.BUILD,
        room: constructionSite.pos.roomName,
        assignedCreeps: [],
        constructionId: constructionSite.id
    };
}

export class BuildTask extends Task<BuildTaskData> {
    constructionSite: ConstructionSite | null;

    constructor(data: BuildTaskData) {
        super(data);
        this.data = data;

        this.constructionSite = Game.getObjectById(data.constructionId);
    }

    public override isStillValid(): boolean {
        return this.constructionSite !== null;
    }

    public override score(creep: Creep): number {
        return 0;
    }

    public override nextAction(creep: Creep): Action | null {
        if (!this.constructionSite) {
            this.data.assignedCreeps = [];

            return null;
        }

        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 50) {
            return new BuildAction(this.constructionSite);
        }

        return new CollectAction();
    }
}
