import { TaskKind } from "../core/TaskKind";
import { RemoteHaulTaskData, ScoutTaskData } from "../core/TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { clearCreepTask, CreepState } from "creeps/CreepState";
import { hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { MoveAction } from "actions/MoveAction";
import { findBestEnergyTask } from "tasks/requirements/EnergyRequirement";
import { creepStoreFull } from "creeps/CreepController";

export function scoutTaskName(originRoom: string): string {
    return "Scout-" + originRoom;
}

export function createScoutTaskData(originRoom: string): ScoutTaskData {
    return {
        id: scoutTaskName(originRoom),
        kind: TaskKind.SCOUT,
        room: originRoom,
        assignedCreeps: []
    };
}

export class RemoteHaulTask extends Task<ScoutTaskData> {
    constructor(data: ScoutTaskData) {
        super(data);
        this.data = data;
    }

    public override isStillValid(): boolean {
        return true;
    }

    public override canPerformTask(creepState: CreepState): boolean {
        return hasBodyPart(creepState.creep, CARRY);
    }

    public override taskIsFull(): boolean {
        return false;
    }

    public override score(creep: Creep): number {
        return 0;
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager): Action | null {
        return null;
    }

    public override validCreationSetup(): void {}
}
