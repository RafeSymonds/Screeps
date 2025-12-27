import { BuildTask } from "./BuildTask";
import { HarvestTask } from "./HarvestTask";
import { AnyTask } from "./Task";
import { TaskData } from "./TaskData";

import { TaskKind } from "./TaskKind";

function constructTask(data: TaskData): AnyTask {
    switch (data.kind) {
        case TaskKind.BUILD:
            return new BuildTask(data);

        case TaskKind.HARVEST:
            return new HarvestTask(data);
    }
}

export function createTask(data: TaskData): AnyTask | null {
    const task = constructTask(data);

    if (task.isStillValid()) {
        return task;
    }

    return null;
}
