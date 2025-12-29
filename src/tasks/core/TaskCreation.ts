import { BuildTask } from "../definitions/BuildTask";
import { HarvestTask } from "../definitions/HarvestTask";
import { AnyTask } from "../definitions/Task";
import { TaskData } from "./TaskData";

import { TaskKind } from "./TaskKind";
import { TransferTask } from "../definitions/TransferTask";
import { UpgradeTask } from "../definitions/UpgradeTask";

function constructTask(data: TaskData): AnyTask {
    switch (data.kind) {
        case TaskKind.BUILD:
            return new BuildTask(data);

        case TaskKind.UPGRADE:
            return new UpgradeTask(data);

        case TaskKind.HARVEST:
            return new HarvestTask(data);

        case TaskKind.TRANSFER:
            return new TransferTask(data);
    }
}

export function createTask(data: TaskData): AnyTask | null {
    const task = constructTask(data);

    if (task.isStillValid()) {
        return task;
    }

    return null;
}
