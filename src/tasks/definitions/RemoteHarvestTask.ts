import { TaskKind } from "../core/TaskKind";
import { RemoteHarvestTaskData } from "../core/TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { HarvestAction } from "actions/HarvestAction";
import { CreepState } from "creeps/CreepState";
import { hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { MoveAction } from "actions/MoveAction";
import { ownedRooms } from "rooms/RoomUtils";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";

const MAX_REMOTE_DISTANCE = 4; // don’t claim absurdly far rooms
const HYSTERESIS_BONUS = 2; // bias toward current owner

export function ownerRoomForRemoteHarvest(remoteRoom: string): string | undefined {
    const rooms = ownedRooms();

    if (rooms.length === 0) {
        return undefined;
    }

    const roomMemory = Memory.rooms[remoteRoom];

    if (!roomMemory || !roomMemory.remoteMining) {
        return undefined;
    }

    const previousOwner = roomMemory.remoteMining.ownerRoom;

    let bestRoom: Room | null = null;
    let bestScore = -Infinity;

    for (const room of rooms) {
        const distance = Game.map.getRoomLinearDistance(room.name, remoteRoom);

        if (distance > MAX_REMOTE_DISTANCE) {
            continue;
        }

        // Base score: closer is better
        let score = -distance * 10;

        // Bias toward previous owner to prevent thrash
        if (room.name === previousOwner) {
            score += HYSTERESIS_BONUS * 10;
        }

        // TODO: add in better indicators
        // score += economyScore(room);
        // score += safetyScore(room);
        // score += infrastructureScore(room);

        if (score > bestScore) {
            bestScore = score;
            bestRoom = room;
        }
    }

    return bestRoom?.name;
}

export function remoteHarvestTaskName(sourceId: Id<Source>, sourcePos: RoomPosition, ownerRoom: string): string {
    return "RemoteHarvest-" + ownerRoom + "-" + sourcePos.roomName + "-" + sourceId;
}

export function createRemoteHarvestTaskData(
    sourceId: Id<Source>,
    sourcePos: RoomPosition,
    ownerRoom: string
): RemoteHarvestTaskData {
    return {
        id: remoteHarvestTaskName(sourceId, sourcePos, ownerRoom),
        kind: TaskKind.REMOTE_HARVEST,
        targetRoom: sourcePos.roomName,
        assignedCreeps: [],
        targetId: sourceId,
        sourcePos: sourcePos,
        ownerRoom: ownerRoom
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
        return true;
    }

    public override canPerformTask(creepState: CreepState, _world: World): boolean {
        return hasBodyPart(creepState.creep, WORK);
    }

    public override taskIsFull(): boolean {
        return this.data.assignedCreeps.length > 0;
    }

    public override score(creep: Creep): number {
        return -1000;
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager): Action | null {
        if (creepState.creep.room.name !== this.data.targetRoom || !this.source) {
            const pos = this.data.sourcePos;
            return new MoveAction(new RoomPosition(pos.x, pos.y, pos.roomName));
        }

        // update that we are still harvesting
        const roomMemory = Memory.rooms[this.data.targetRoom];

        if (!roomMemory || !roomMemory.remoteMining) {
            return null;
        }

        console.log("remote harvest harvest action");

        roomMemory.remoteMining.lastHarvestTick = Game.time;
        Memory.rooms[this.data.targetRoom] = roomMemory;

        return new HarvestAction(this.source);
    }

    public override validCreationSetup(): void {}

    public requirements(): TaskRequirements {
        return { mine: 5 };
    }
}
