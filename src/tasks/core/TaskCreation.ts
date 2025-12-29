import { BuildTask } from "../definitions/BuildTask";
import { HarvestTask } from "../definitions/HarvestTask";
import { AnyTask } from "../definitions/Task";
import { TaskData } from "./TaskData";

import { TaskKind } from "./TaskKind";
import { HaulTask } from "../definitions/HaulTask";
import { UpgradeTask } from "../definitions/UpgradeTask";
import { RemoteHaulTask } from "tasks/definitions/RemoteHaulTask";
import { RemoteHarvestTask } from "tasks/definitions/RemoteHarvestTask";
import { ScoutTask } from "tasks/definitions/ScoutTask";

function constructTask(data: TaskData): AnyTask {
    switch (data.kind) {
        case TaskKind.BUILD:
            return new BuildTask(data);

        case TaskKind.UPGRADE:
            return new UpgradeTask(data);

        case TaskKind.HARVEST:
            return new HarvestTask(data);

        case TaskKind.REMOTE_HARVEST:
            return new RemoteHarvestTask(data);

        case TaskKind.REMOTE_HAUL:
            return new RemoteHaulTask(data);

        case TaskKind.HAUL:
            return new HaulTask(data);

        case TaskKind.SCOUT:
            return new ScoutTask(data);
    }
}

export function createTask(data: TaskData): AnyTask | null {
    const task = constructTask(data);

    if (task.isStillValid()) {
        return task;
    }

    return null;
}
