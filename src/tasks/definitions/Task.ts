import { Action } from "actions/Action";
import { TaskData } from "../core/TaskData";
import { CreepState } from "creeps/CreepState";
import { ResourceManager } from "rooms/ResourceManager";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";
import { TaskKind } from "tasks/core/TaskKind";
import { intelStatus, IntelStatus } from "rooms/RoomIntel";
import { activeSupportRequest } from "rooms/RoomSupport";
import { TaskSafetyPolicy } from "tasks/core/TaskData";
import { estimateSafeRouteLength } from "rooms/InterRoomRouter";

export abstract class Task<T extends TaskData> {
    data: T;

    protected reservedWork = 0;

    constructor(data: T) {
        this.data = data;
    }

    public abstract isStillValid(): boolean;

    public abstract canPerformTask(creepState: CreepState, world: World): boolean;

    protected abstract taskIsFull(): boolean;

    public canAcceptCreep(_creepState: CreepState, _world: World): boolean {
        return !this.taskIsFull();
    }

    public isDangerous(): boolean {
        return intelStatus(Memory.rooms[this.data.targetRoom]?.intel) === IntelStatus.DANGEROUS;
    }

    public allowsDangerousAssignment(): boolean {
        return this.data.safetyPolicy === TaskSafetyPolicy.ALLOW_DANGEROUS_ASSIGNMENT;
    }

    public ownerRoom(): string {
        return this.data.ownerRoom ?? this.data.targetRoom;
    }

    public routeLength(fromRoom: string): number {
        const explicitLength = "routeLength" in this.data ? this.data.routeLength : undefined;

        if (explicitLength !== undefined) {
            return explicitLength;
        }

        return estimateSafeRouteLength(fromRoom, this.data.targetRoom) ?? Game.map.getRoomLinearDistance(fromRoom, this.data.targetRoom);
    }

    public assignmentScore(creepState: CreepState): number {
        let score = this.score(creepState.creep);
        const routeLength = this.routeLength(creepState.creep.room.name);

        if (this.ownerRoom() === creepState.memory.ownerRoom) {
            score += 50;
        }

        if (creepState.memory.lastTaskRoom === this.data.targetRoom) {
            score += 20;
        }

        if (creepState.memory.lastTaskKind === this.type()) {
            score += 10;
        }

        const supportRequest = activeSupportRequest(this.data.targetRoom);
        if (supportRequest) {
            score += supportRequest.priority;
        }

        if (TaskKind.isRemote(this.type())) {
            score -= routeLength * 25;
        } else {
            score -= routeLength * 10;
        }

        return score;
    }

    public abstract score(creep: Creep): number;

    public abstract nextAction(creep: CreepState, resourceManager: ResourceManager): Action | null;

    public abstract validCreationSetup(): void;

    public abstract requirements(): TaskRequirements;

    public id() {
        return this.data.id;
    }

    public assignCreep(creepState: CreepState, _world: World) {
        this.data.assignedCreeps.push([creepState.creep.id, creepState.creep.name]);
    }

    public removeCreep(creepState: CreepState) {
        this.data.assignedCreeps = this.data.assignedCreeps.filter(([id, _]) => id !== creepState.creep.id);
    }

    public removeDeadCreep(deadName: string) {
        this.data.assignedCreeps = this.data.assignedCreeps.filter(([, name]) => name !== deadName);
    }

    public type(): TaskKind {
        return this.data.kind;
    }
}

export type AnyTask = Task<TaskData>;
export type TaskIdSet = Set<string>;
