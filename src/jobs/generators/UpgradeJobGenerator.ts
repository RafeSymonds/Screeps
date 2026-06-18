import { JOB_PRIORITY } from "config/constants";
import { JobBoard } from "jobs/JobBoard";
import { JobKind } from "jobs/types";
import { WorldRoom } from "world/WorldRoom";

/** One upgrade job per owned controller. */
export function generateUpgradeJobs(worldRoom: WorldRoom, board: JobBoard): void {
    const controller = worldRoom.controller;
    if (!controller || !controller.my) {
        return;
    }
    board.upsert({
        id: `upgrade:${worldRoom.name}`,
        kind: JobKind.Upgrade,
        roomName: worldRoom.name,
        targetId: controller.id,
        capacity: 3,
        assigned: [],
        priority: JOB_PRIORITY[JobKind.Upgrade],
        demand: { work: 1, carry: 1 }
    });
}
