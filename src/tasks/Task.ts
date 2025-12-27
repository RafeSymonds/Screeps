import { Action } from "actions/Action";
import { TaskData } from "./TaskData";

export abstract class Task<T extends TaskData> {
    data: T;

    constructor(data: T) {
        this.data = data;
    }

    public abstract isStillValid(): boolean;

    public abstract score(creep: Creep): number;

    public abstract nextAction(creep: Creep): Action | null;
}

export type AnyTask = Task<TaskData>;
export type TaskIdSet = Set<string>;
