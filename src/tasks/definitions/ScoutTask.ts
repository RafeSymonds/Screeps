import { MoveAction } from "actions/MoveAction";
import { TaskKind } from "../core/TaskKind";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { CreepState } from "creeps/CreepState";
import { hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { ScoutTaskData, TaskSafetyPolicy } from "tasks/core/TaskData";
import { recordRoom } from "rooms/RoomIntel";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";

export function scoutTaskName(originRoom: string): string {
    return "Scout-" + originRoom;
}

export function createScoutTaskData(roomToScout: string, priority?: number): ScoutTaskData {
    return {
        id: scoutTaskName(roomToScout),
        kind: TaskKind.SCOUT,
        targetRoom: roomToScout,
        assignedCreeps: [],
        safetyPolicy: TaskSafetyPolicy.ALLOW_DANGEROUS_ASSIGNMENT,
        priority
    };
}

export class ScoutTask extends Task<ScoutTaskData> {
    constructor(data: ScoutTaskData) {
        super(data);
        this.data = data;
    }

    public override isStillValid(): boolean {
        const intel = Memory.rooms[this.data.targetRoom]?.intel;
        if (!intel) return true;

        const freshness = Game.time - intel.lastScouted;
        return freshness > 5000; // Only valid if intel is actually stale
    }

    public override canPerformTask(creepState: CreepState, _world: World): boolean {
        return (
            hasBodyPart(creepState.creep, MOVE) &&
            !hasBodyPart(creepState.creep, WORK) &&
            !hasBodyPart(creepState.creep, CARRY)
        );
    }

    protected override taskIsFull(): boolean {
        return this.data.assignedCreeps.length >= 1;
    }

    public override score(_creep: Creep): number {
        const intel = Memory.rooms[this.data.targetRoom]?.intel;
        const freshness = Game.time - (intel?.lastScouted || 0);

        return freshness * (this.data.priority ?? 1);
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager, world: World): Action | null {
        if (creepState.creep.room.name !== this.data.targetRoom) {
            return new MoveAction(new RoomPosition(25, 25, this.data.targetRoom));
        }

        recordRoom(creepState.creep.room);

        // Force unassign and clear taskId
        creepState.memory.taskId = undefined;
        return null;
    }

    public override validCreationSetup(): void {}

    public override requirements(): TaskRequirements {
        return {
            vision: true,
            move: {
                creeps: 1
            }
        };
    }
}
