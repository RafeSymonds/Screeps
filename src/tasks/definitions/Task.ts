import { Action } from "actions/Action";
import { TaskData } from "../core/TaskData";
import { CreepState } from "creeps/CreepState";
import { ResourceManager } from "rooms/ResourceManager";

export abstract class Task<T extends TaskData> {
    data: T;

    constructor(data: T) {
        this.data = data;
    }

    public abstract isStillValid(): boolean;

    public abstract canPerformTask(creepState: CreepState): boolean;

    public abstract taskIsFull(): boolean;

    public abstract score(creep: Creep): number;

    public abstract nextAction(creep: CreepState, resourceManager: ResourceManager): Action | null;

    public abstract validCreationSetup(): void;

    public id() {
        return this.data.id;
    }

    public assignCreep(creepState: CreepState) {
        this.data.assignedCreeps.push([creepState.creep.id, creepState.creep.name]);
    }

    public removeCreep(creepState: CreepState) {
        this.data.assignedCreeps = this.data.assignedCreeps.filter(([id]) => id !== creepState.creep.id);
    }

    public removeDeadCreep(deadName: string) {
        this.data.assignedCreeps = this.data.assignedCreeps.filter(([, name]) => name !== deadName);
    }
}

export type AnyTask = Task<TaskData>;
export type TaskIdSet = Set<string>;
