import { TaskKind } from "../core/TaskKind";
import { RemoteHaulTaskData } from "../core/TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { CreepState } from "creeps/CreepState";
import { hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { MoveAction } from "actions/MoveAction";
import { findBestEnergyTask } from "tasks/requirements/EnergyRequirement";
import { creepStoreFull, creepStoreFullPercentage } from "creeps/CreepController";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";

export function remoteHaulTaskName(sourceId: Id<Source>, sourcePos: RoomPosition): string {
    return "RemoteHaul-" + sourcePos.roomName + "-" + sourceId;
}

export function createRemoteHaulTaskData(sourceId: Id<Source>, sourcePos: RoomPosition): RemoteHaulTaskData {
    return {
        id: remoteHaulTaskName(sourceId, sourcePos),
        kind: TaskKind.REMOTE_HAUL,
        targetRoom: sourcePos.roomName,
        assignedCreeps: []
    };
}

const HARVEST_TIMEOUT = 50;

export class RemoteHaulTask extends Task<RemoteHaulTaskData> {
    constructor(data: RemoteHaulTaskData) {
        super(data);
        this.data = data;
    }

    public override isStillValid(): boolean {
        return true;
    }

    public override canPerformTask(creepState: CreepState, world: World): boolean {
        return (
            hasBodyPart(creepState.creep, CARRY) &&
            world.resourceManager.roomHasEnoughEnergy(creepState, this.data.targetRoom) &&
            creepStoreFullPercentage(creepState.creep) < 0.25
        );
    }

    public override taskIsFull(): boolean {
        const roomMemory = Memory.rooms[this.data.targetRoom];

        if (!roomMemory || !roomMemory.remoteMining) {
            return true;
        }

        return Game.time - roomMemory.remoteMining.lastHarvestTick < HARVEST_TIMEOUT;
    }

    public override score(creep: Creep): number {
        return -1000 - Game.map.getRoomLinearDistance(creep.room.name, this.data.targetRoom) * 50;
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager): Action | null {
        if (creepState.creep.room.name === creepState.memory.ownerRoom && creepStoreFull(creepState.creep)) {
            // we are done since we are back in our main room
            return null;
        }

        // check to see if we are in the remote room
        if (creepState.creep.room.name !== this.data.targetRoom) {
            return new MoveAction(new RoomPosition(25, 25, this.data.targetRoom));
        }

        // if we are full or we have stopped working, go back to owner room
        if (creepStoreFull(creepState.creep) || !creepState.memory.working) {
            return new MoveAction(new RoomPosition(25, 25, creepState.memory.ownerRoom));
        }

        const energyTask = findBestEnergyTask(creepState, null, resourceManager);

        if (!energyTask) {
            creepState.memory.working = false;
            return new MoveAction(new RoomPosition(25, 25, creepState.memory.ownerRoom));
        }

        return energyTask;
    }

    public override validCreationSetup(): void {}

    requirements(): TaskRequirements {
        const energyPerTick = 10;

        // TODO: calculate better
        const distance = 50;
        const roundTrip = distance * 2;

        return {
            carry: Math.ceil((energyPerTick * roundTrip) / 50)
        };
    }
}
