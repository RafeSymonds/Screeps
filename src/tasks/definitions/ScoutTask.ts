import { MoveAction } from "actions/MoveAction";
import { TaskKind } from "../core/TaskKind";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { CreepState } from "creeps/CreepState";
import { hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { ScoutTaskData } from "tasks/core/TaskData";
import { recordRoom } from "rooms/RoomIntel";

export function scoutTaskName(originRoom: string): string {
    return "Scout-" + originRoom;
}

export function createScoutTaskData(roomToScout: string): ScoutTaskData {
    return {
        id: scoutTaskName(roomToScout),
        kind: TaskKind.SCOUT,
        room: roomToScout,
        assignedCreeps: []
    };
}

export class ScoutTask extends Task<ScoutTaskData> {
    constructor(data: ScoutTaskData) {
        super(data);
        this.data = data;
    }

    public override isStillValid(): boolean {
        return true;
    }

    public override canPerformTask(creepState: CreepState): boolean {
        return hasBodyPart(creepState.creep, MOVE);
    }

    public override taskIsFull(): boolean {
        return false;
    }

    public override score(creep: Creep): number {
        return 0;
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager): Action | null {
        if (creepState.creep.room.name !== this.data.room) {
            return new MoveAction(new RoomPosition(25, 25, this.data.room));
        }

        recordRoom(creepState.creep.room);
        return null;
    }

    public override validCreationSetup(): void {}
}
