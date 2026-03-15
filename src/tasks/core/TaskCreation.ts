import { BuildTask } from "../definitions/BuildTask";
import { HarvestTask } from "../definitions/HarvestTask";
import { AnyTask } from "../definitions/Task";
import { TaskData } from "./TaskData";

import { TaskKind } from "./TaskKind";
import { DeliverTask } from "../definitions/DeliverTask";
import { UpgradeTask } from "../definitions/UpgradeTask";
import { RemoteHaulTask } from "tasks/definitions/RemoteHaulTask";
import { RemoteHarvestTask } from "tasks/definitions/RemoteHarvestTask";
import { ScoutTask } from "tasks/definitions/ScoutTask";
import { DefendTask } from "tasks/definitions/DefendTask";
import { ClaimTask } from "tasks/definitions/ClaimTask";
import { AttackTask } from "tasks/definitions/AttackTask";
import { ReserveTask } from "tasks/definitions/ReserveTask";

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

        case TaskKind.DELIVER:
            return new DeliverTask(data);

        case TaskKind.SCOUT:
            return new ScoutTask(data);

        case TaskKind.DEFEND:
            return new DefendTask(data);

        case TaskKind.CLAIM:
            return new ClaimTask(data);

        case TaskKind.ATTACK:
            return new AttackTask(data);

        case TaskKind.RESERVE:
            return new ReserveTask(data);
    }
}

export function createTask(data: TaskData): AnyTask | null {
    const task = constructTask(data);

    if (task.isStillValid()) {
        return task;
    }

    return null;
}
