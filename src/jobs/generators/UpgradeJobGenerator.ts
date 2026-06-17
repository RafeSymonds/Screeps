import { JOB_PRIORITY } from "config/constants";
import { JobBoard } from "jobs/JobBoard";
import { WorldRoom } from "world/WorldRoom";

/** One upgrade job per owned controller. */
export function generateUpgradeJobs(worldRoom: WorldRoom, board: JobBoard): void {
    const controller = worldRoom.controller;
    if (!controller || !controller.my) {
        return;
    }
    board.upsert({
        id: `upgrade:${worldRoom.name}`,
        kind: "upgrade",
        roomName: worldRoom.name,
        targetId: controller.id,
        capacity: 3,
        assigned: [],
        priority: JOB_PRIORITY.upgrade,
        demand: { work: 1, carry: 1 }
    });
}
