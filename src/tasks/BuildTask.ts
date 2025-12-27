import { TaskKind } from "./TaskKind";
import { BuildTaskData } from "./TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { BuildAction } from "actions/BuildAction";
import { CreepState } from "creeps/CreepState";
import { findBestEnergyTask } from "./NeedEnergyPrereq";
import { hasBodyPart } from "creeps/CreepUtils";

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

    public canPerformTask(creepState: CreepState): boolean {
        return hasBodyPart(creepState.creep, WORK) && hasBodyPart(creepState.creep, CARRY);
    }

    public override score(creep: Creep): number {
        return 0;
    }

    public override nextAction(creepState: CreepState): Action | null {
        if (!this.constructionSite) {
            this.data.assignedCreeps = [];
            creepState.memory.taskId = undefined;

            return null;
        }

        if (creepState.creep.store.getUsedCapacity(RESOURCE_ENERGY) > 50) {
            return new BuildAction(this.constructionSite);
        }

        return findBestEnergyTask(creepState);
    }
}
