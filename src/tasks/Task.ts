import { Action } from "actions/Action";
import { TaskData } from "./TaskData";
import { CreepState } from "creeps/CreepState";
import { ResourceManager } from "rooms/ResourceManager";

export abstract class Task<T extends TaskData> {
    data: T;

    constructor(data: T) {
        this.data = data;
    }

    public abstract isStillValid(): boolean;

    public abstract canPerformTask(creepState: CreepState): boolean;

    public abstract score(creep: Creep): number;

    public abstract nextAction(creep: CreepState, resourceManager: ResourceManager): Action | null;

    public id() {
        return this.data.id;
    }

    public assignCreep(creep: Creep) {
        this.data.assignedCreeps.push(creep.id);
    }
}

export type AnyTask = Task<TaskData>;
export type TaskIdSet = Set<string>;
