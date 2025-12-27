import { BuildTask } from "./BuildTask";
import { HarvestTask } from "./HarvestTask";
import { TaskData } from "./TaskData";
import { TaskKind } from "./TaskKind";

export abstract class Task {
    public abstract isStillValid(): boolean;

    public abstract score(creep: Creep): number;
}

export function constructTask(data: TaskData): Task {
    switch (data.kind) {
        case TaskKind.BUILD:
            return new BuildTask(data);

        case TaskKind.HARVEST:
            return new HarvestTask(data);
    }
}

export function getTasks(): Map<string, Task> {
    return new Map<string, Task>(Memory.tasks.map(task => [task.id, constructTask(task)]));
}
