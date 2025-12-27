import { BuildTask } from "./BuildTask";
import { HarvestTask } from "./HarvestTask";
import { AnyTask } from "./Task";
import { TaskData } from "./TaskData";

import { TaskKind } from "./TaskKind";

export function createTask(data: TaskData): AnyTask {
    switch (data.kind) {
        case TaskKind.BUILD:
            return new BuildTask(data);

        case TaskKind.HARVEST:
            return new HarvestTask(data);
    }
}
