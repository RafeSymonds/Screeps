import { Action } from "actions/Action";
import { ReserveAction } from "actions/ReserveAction";
import { MoveAction } from "actions/MoveAction";
import { hasBodyPart } from "creeps/CreepUtils";
import { CreepState } from "creeps/CreepState";
import { ResourceManager } from "rooms/ResourceManager";
import { ReserveTaskData } from "tasks/core/TaskData";
import { TaskKind } from "tasks/core/TaskKind";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";
import { Task } from "./Task";
import { getMyUsername } from "utils/GameUtils";

export function reserveTaskName(targetRoom: string): string {
    return "Reserve-" + targetRoom;
}

export function createReserveTaskData(targetRoom: string, ownerRoom: string): ReserveTaskData {
    return {
        id: reserveTaskName(targetRoom),
        kind: TaskKind.RESERVE,
        targetRoom,
        ownerRoom,
        assignedCreeps: []
    };
}

export class ReserveTask extends Task<ReserveTaskData> {
    constructor(data: ReserveTaskData) {
        super(data);
    }

    public override isStillValid(): boolean {
        const room = Game.rooms[this.data.targetRoom];

        // Still valid if we can't see the room (creep in transit)
        if (!room) return true;

        // Invalid if owned by someone
        if (room.controller?.owner) return false;

        // Valid if reservation is low or nonexistent
        const reservation = room.controller?.reservation;
        if (!reservation) return true;

        // Valid if our reservation is decaying
        if (reservation.username === getMyUsername()) {
            return reservation.ticksToEnd < 4000;
        }

        // Invalid if someone else has a strong reservation
        return reservation.ticksToEnd < 1000;
    }

    public override canPerformTask(creepState: CreepState, _world: World): boolean {
        return hasBodyPart(creepState.creep, CLAIM);
    }

    protected override taskIsFull(): boolean {
        return this.data.assignedCreeps.length >= 1;
    }

    public override score(creep: Creep): number {
        return 150 - Game.map.getRoomLinearDistance(creep.room.name, this.data.targetRoom) * 15;
    }

    public override nextAction(creepState: CreepState, _resourceManager: ResourceManager): Action | null {
        const room = Game.rooms[this.data.targetRoom];

        if (creepState.creep.room.name !== this.data.targetRoom || !room?.controller) {
            return new MoveAction(new RoomPosition(25, 25, this.data.targetRoom));
        }

        return new ReserveAction(room.controller);
    }

    public override validCreationSetup(): void {}

    public override requirements(): TaskRequirements {
        return {
            vision: true
        };
    }
}
