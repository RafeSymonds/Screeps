import { Action } from "actions/Action";
import { BuildTask } from "./BuildTask";
import { HarvestTask } from "./HarvestTask";
import { TaskData } from "./TaskData";

import { TaskKind } from "./TaskKind";

export abstract class Task {
    public abstract isStillValid(): boolean;

    public abstract score(creep: Creep): number;

    public abstract ready(creep: Creep): Action | null;
}

export type TaskMap = Map<string, Task>;

export function constructTask(data: TaskData): Task {
    switch (data.kind) {
        case TaskKind.BUILD:
            return new BuildTask(data);

        case TaskKind.HARVEST:
            return new HarvestTask(data);
    }
}

export function constructTasks(tasks: TaskData[]): TaskMap {
    return new Map(tasks.map(task => [task.id, constructTask(task)]));
}

export type RoomTasksMap = Map<string, TaskMap>;

export function getRoomTasks(): RoomTasksMap {
    return new Map(Memory.roomTasks.map(roomTasks => [roomTasks.name, constructTasks(roomTasks.tasks)]));
}
