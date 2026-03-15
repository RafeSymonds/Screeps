import { Action } from "actions/Action";
import { MoveAction } from "actions/MoveAction";
import { CreepState } from "creeps/CreepState";
import { hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { TaskKind } from "tasks/core/TaskKind";
import { ClaimTaskData } from "tasks/core/TaskData";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";
import { Task } from "./Task";
import { ClaimAction } from "actions/ClaimAction";

export function createClaimTaskData(targetRoom: string, ownerRoom: string): ClaimTaskData {
    return {
        id: `Claim-${targetRoom}`,
        kind: TaskKind.CLAIM,
        targetRoom,
        ownerRoom,
        assignedCreeps: []
    };
}

export class ClaimTask extends Task<ClaimTaskData> {
    constructor(data: ClaimTaskData) {
        super(data);
    }

    public override isStillValid(): boolean {
        const room = Game.rooms[this.data.targetRoom];

        // Invalid if we already own this room
        if (room?.controller?.my) {
            return false;
        }

        // Invalid if someone else owns it
        if (room?.controller?.owner) {
            return false;
        }

        return true;
    }

    public override canPerformTask(creepState: CreepState, _world: World): boolean {
        return hasBodyPart(creepState.creep, CLAIM) && creepState.memory.ownerRoom === this.data.ownerRoom;
    }

    protected override taskIsFull(): boolean {
        return this.data.assignedCreeps.length >= 1;
    }

    public override score(creep: Creep): number {
        return 200 - Game.map.getRoomLinearDistance(creep.room.name, this.data.targetRoom) * 20;
    }

    public override nextAction(creepState: CreepState, _resourceManager: ResourceManager): Action | null {
        const room = Game.rooms[this.data.targetRoom];

        // Not in the target room yet — move there
        if (creepState.creep.room.name !== this.data.targetRoom || !room?.controller) {
            return new MoveAction(new RoomPosition(25, 25, this.data.targetRoom));
        }

        // Already claimed
        if (room.controller.my) {
            creepState.memory.taskId = undefined;
            return null;
        }

        return new ClaimAction(room.controller);
    }

    public override validCreationSetup(): void {}

    public override requirements(): TaskRequirements {
        return {
            vision: true
        };
    }
}
