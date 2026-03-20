import { TaskKind } from "../core/TaskKind";
import { RemoteHarvestTaskData } from "../core/TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { HarvestAction } from "actions/HarvestAction";
import { CreepState } from "creeps/CreepState";
import { countBodyParts, hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { MoveAction } from "actions/MoveAction";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";
import { remoteAssignmentForRoom } from "rooms/RemoteStrategy";

export function remoteHarvestTaskName(sourceId: Id<Source>, sourcePos: RoomPosition, ownerRoom: string): string {
    return "RemoteHarvest-" + ownerRoom + "-" + sourcePos.roomName + "-" + sourceId;
}

export function createRemoteHarvestTaskData(
    sourceId: Id<Source>,
    sourcePos: RoomPosition,
    ownerRoom: string,
    routeLength: number
): RemoteHarvestTaskData {
    return {
        id: remoteHarvestTaskName(sourceId, sourcePos, ownerRoom),
        kind: TaskKind.REMOTE_HARVEST,
        targetRoom: sourcePos.roomName,
        assignedCreeps: [],
        targetId: sourceId,
        sourcePos,
        ownerRoom,
        routeLength
    };
}

export class RemoteHarvestTask extends Task<RemoteHarvestTaskData> {
    source: Source | null;

    constructor(data: RemoteHarvestTaskData) {
        super(data);
        this.data = data;
        this.source = Game.getObjectById(data.targetId);
    }

    public override isStillValid(): boolean {
        if (this.isDangerous()) {
            return false;
        }

        const strategy = remoteAssignmentForRoom(this.data.targetRoom);

        return strategy?.state === "active" && strategy.ownerRoom === this.data.ownerRoom;
    }

    public override canPerformTask(creepState: CreepState, _world: World): boolean {
        return (
            hasBodyPart(creepState.creep, WORK) &&
            countBodyParts(creepState.creep, CARRY) <= 1 &&
            creepState.memory.ownerRoom === this.data.ownerRoom
        );
    }

    protected override taskIsFull(): boolean {
        return this.data.assignedCreeps.length > 0;
    }

    public override score(creep: Creep): number {
        return (
            -1000 -
            this.data.routeLength * 25 -
            Game.map.getRoomLinearDistance(creep.room.name, this.data.targetRoom) * 10
        );
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager, world: World): Action | null {
        if (creepState.creep.room.name !== this.data.targetRoom || !this.source) {
            const pos = this.data.sourcePos;
            return new MoveAction(new RoomPosition(pos.x, pos.y, pos.roomName));
        }

        // update that we are still harvesting
        const roomMemory = Memory.rooms[this.data.targetRoom];

        if (!roomMemory || !roomMemory.remoteMining) {
            return null;
        }

        roomMemory.remoteMining.lastHarvestTick = Game.time;
        Memory.rooms[this.data.targetRoom] = roomMemory;

        return new HarvestAction(this.source);
    }

    public override validCreationSetup(): void {}

    public override requirements(): TaskRequirements {
        return {
            mine: {
                parts: 5,
                creeps: 1
            }
        };
    }
}
