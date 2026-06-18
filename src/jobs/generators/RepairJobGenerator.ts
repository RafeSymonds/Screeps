import { JOB_PRIORITY } from "config/constants";
import { JobBoard } from "jobs/JobBoard";
import { JobKind } from "jobs/types";
import { WorldRoom } from "world/WorldRoom";

/**
 * One room-level repair job while any non-fortification structure (roads,
 * containers) is decayed below the repair threshold. The executor repairs the
 * most-damaged target each tick; JobBoard.prune() removes the job once nothing
 * needs repair.
 */
export function generateRepairJobs(worldRoom: WorldRoom, board: JobBoard): void {
    if (worldRoom.repairTargets().length === 0) {
        return;
    }
    board.upsert({
        id: `repair:${worldRoom.name}`,
        kind: JobKind.Repair,
        roomName: worldRoom.name,
        capacity: 1,
        assigned: [],
        priority: JOB_PRIORITY[JobKind.Repair],
        demand: { work: 1, carry: 1 }
    });
}
