import { TaskKind } from "../core/TaskKind";
import { RemoteHaulTaskData } from "../core/TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { CreepState } from "creeps/CreepState";
import { hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { MoveAction } from "actions/MoveAction";
import { findBestEnergyTask } from "tasks/requirements/EnergyRequirement";
import { creepStoreFull } from "creeps/CreepController";
import { getRemoteRoomMemory } from "rooms/RemoteMiningData";

export function remoteHaulTaskName(source: Source): string {
    return "RemoteHaul-" + source.room.name + "-" + source.id;
}

export function createRemoteHaulTaskData(source: Source): RemoteHaulTaskData {
    return {
        id: remoteHaulTaskName(source),
        kind: TaskKind.REMOTE_HAUL,
        room: source.room.name,
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

    public override canPerformTask(creepState: CreepState): boolean {
        return hasBodyPart(creepState.creep, CARRY);
    }

    public override taskIsFull(): boolean {
        return Game.time - getRemoteRoomMemory(this.data.room).lastHarvestTick < HARVEST_TIMEOUT;
    }

    public override score(creep: Creep): number {
        return -1000 - Game.map.getRoomLinearDistance(creep.room.name, this.data.room) * 50;
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager): Action | null {
        if (creepState.creep.room.name === creepState.memory.ownerRoom && creepStoreFull(creepState.creep)) {
            // we are done since we are back in our main room
            return null;
        }

        // check to see if we are in the remote room
        if (creepState.creep.room.name !== this.data.room) {
            return new MoveAction(new RoomPosition(25, 25, this.data.room));
        }

        // if we are full or we have stopped working, go back to owner room
        if (creepStoreFull(creepState.creep) || !creepState.memory.working) {
            return new MoveAction(new RoomPosition(50, 50, creepState.memory.ownerRoom));
        }

        const energyTask = findBestEnergyTask(creepState, null, resourceManager);

        if (!energyTask) {
            creepState.memory.working = false;
        }

        return energyTask;
    }

    public override validCreationSetup(): void {}
}
