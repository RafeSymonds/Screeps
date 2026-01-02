import { Action } from "actions/Action";
import { TaskData } from "../core/TaskData";
import { CreepState } from "creeps/CreepState";
import { ResourceManager } from "rooms/ResourceManager";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";

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
}

export type AnyTask = Task<TaskData>;
export type TaskIdSet = Set<string>;
