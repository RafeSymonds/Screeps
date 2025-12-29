import { TaskKind } from "../core/TaskKind";
import { RemoteHaulTaskData } from "../core/TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { clearCreepTask, CreepState } from "creeps/CreepState";
import { hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { MoveAction } from "actions/MoveAction";
import { findBestEnergyTask } from "tasks/requirements/EnergyRequirement";
import { creepStoreFull } from "creeps/CreepController";

export function remoteHaulTaskName(source: Source): string {
    return "RemoteHaul-" + source.room.name + "-" + source.id;
}

export function createRemoteHaulTaskData(source: Source): RemoteHaulTaskData {
    return {
        id: remoteHaulTaskName(source),
        kind: TaskKind.REMOTE_HAUL,
        room: source.room.name,
        assignedCreeps: [],
        targetId: source.id,
        sourcePos: source.pos
    };
}

export class RemoteHaulTask extends Task<RemoteHaulTaskData> {
    source: Source | null;

    constructor(data: RemoteHaulTaskData) {
        super(data);
        this.data = data;
        this.source = Game.getObjectById(data.targetId);
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
        return -1000 + creep.pos.getRangeTo(this.data.sourcePos);
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager): Action | null {
        if (creepState.creep.room.name === creepState.memory.ownerRoom && creepStoreFull(creepState.creep)) {
            super.removeCreep(creepState);
            clearCreepTask(creepState);
            return null;
        }

        // check to see if we are in the remote room
        if (creepState.creep.room.name !== this.data.sourcePos.roomName) {
            return new MoveAction(this.data.sourcePos);
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
