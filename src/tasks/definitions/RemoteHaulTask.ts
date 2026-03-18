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
import { remoteAssignmentForRoom } from "rooms/RemoteStrategy";

export function remoteHaulTaskName(sourceId: Id<Source>, sourcePos: RoomPosition): string {
    return "RemoteHaul-" + sourcePos.roomName + "-" + sourceId;
}

export function createRemoteHaulTaskData(
    sourceId: Id<Source>,
    sourcePos: RoomPosition,
    ownerRoom: string,
    routeLength: number
): RemoteHaulTaskData {
    return {
        id: remoteHaulTaskName(sourceId, sourcePos),
        kind: TaskKind.REMOTE_HAUL,
        targetRoom: sourcePos.roomName,
        assignedCreeps: [],
        ownerRoom,
        routeLength
    };
}

const HARVEST_TIMEOUT = 50;

export class RemoteHaulTask extends Task<RemoteHaulTaskData> {
    constructor(data: RemoteHaulTaskData) {
        super(data);
        this.data = data;
    }

    public override isStillValid(): boolean {
        if (this.isDangerous()) {
            return false;
        }

        const strategy = remoteAssignmentForRoom(this.data.targetRoom);

        return strategy?.state === "active" && strategy.ownerRoom === this.data.ownerRoom;
    }

    public override canPerformTask(creepState: CreepState, world: World): boolean {
        return (
            hasBodyPart(creepState.creep, CARRY) &&
            !hasBodyPart(creepState.creep, WORK) &&
            creepState.memory.ownerRoom === this.data.ownerRoom &&
            world.resourceManager.roomHasEnoughEnergy(creepState, this.data.targetRoom) &&
            creepStoreFullPercentage(creepState.creep) < 0.25
        );
    }

    protected override taskIsFull(): boolean {
        const roomMemory = Memory.rooms[this.data.targetRoom];

        if (!roomMemory || !roomMemory.remoteMining) {
            return true;
        }

        return Game.time - roomMemory.remoteMining.lastHarvestTick > HARVEST_TIMEOUT;
    }

    public override score(creep: Creep): number {
        return -10000 - this.data.routeLength * 40 - Game.map.getRoomLinearDistance(creep.room.name, this.data.targetRoom) * 25;
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager): Action | null {
        if (
            creepState.creep.room.name === this.data.ownerRoom &&
            (creepStoreFull(creepState.creep) || !creepState.memory.working)
        ) {
            // we are done since we are back in our main room
            creepState.memory.taskId = undefined;
            creepState.memory.remoteEnergyReserved = undefined;
            creepState.memory.remoteEnergyRoom = undefined;
            return null;
        }

        // if we are full or we have stopped working, go back to owner room
        if (creepStoreFull(creepState.creep) || !creepState.memory.working) {
            creepState.memory.remoteEnergyReserved = undefined;
            creepState.memory.remoteEnergyRoom = undefined;

            return new MoveAction(new RoomPosition(25, 25, this.data.ownerRoom));
        }

        // check to see if we are in the remote room
        if (creepState.creep.room.name !== this.data.targetRoom) {
            return new MoveAction(new RoomPosition(25, 25, this.data.targetRoom));
        }

        const energyTask = findBestEnergyTask(creepState, null, resourceManager);

        // if there are no energy pickups, just go home
        if (!energyTask) {
            creepState.memory.working = false;

            creepState.memory.remoteEnergyReserved = undefined;
            creepState.memory.remoteEnergyRoom = undefined;

            return new MoveAction(new RoomPosition(25, 25, this.data.ownerRoom));
        }

        return energyTask;
    }

    public override validCreationSetup(): void {}

    public override assignCreep(creepState: CreepState, world: World): void {
        super.assignCreep(creepState, world);

        const roomMem = Memory.rooms[this.data.targetRoom];
        if (!roomMem?.remoteMining) return;

        const free = creepState.creep.store.getFreeCapacity(RESOURCE_ENERGY);

        creepState.memory.remoteEnergyRoom = this.data.targetRoom;
        creepState.memory.remoteEnergyReserved = free;

        world.resourceManager.reserveRemoteEnergy(this.data.targetRoom, free);
    }

    requirements(): TaskRequirements {
        const energyPerTick = 10;
        const roomDistance = Math.max(1, this.data.routeLength);
        const distance = roomDistance * 50;
        const roundTrip = distance * 2;

        return {
            carry: {
                parts: Math.ceil((energyPerTick * roundTrip) / 50)
            }
        };
    }
}
