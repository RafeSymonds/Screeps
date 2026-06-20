import { JOB_PRIORITY, MAX_ROOM_POPULATION } from "config/constants";
import { JobBoard } from "jobs/JobBoard";
import { JobKind } from "jobs/types";
import { WorldRoom } from "world/WorldRoom";

/**
 * One upgrade job per owned controller. Upgrade is the **residual sink** — the
 * lowest rung of the priority ladder — so its capacity is sized to absorb the whole
 * room: every creep the bounded needs (mine/haul/build/repair) don't claim ends up
 * here. The matcher fills by priority, so this large capacity is never the binding
 * constraint; it just guarantees no capable creep is left idle for want of an
 * upgrade slot. (Per-tick upgrade throughput is only truly capped at RCL8 — a future
 * concern handled with links/storage, not by starving the job here.)
 */
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
        capacity: MAX_ROOM_POPULATION,
        assigned: [],
        priority: JOB_PRIORITY[JobKind.Upgrade],
        demand: { work: 1, carry: 1 }
    });
}
