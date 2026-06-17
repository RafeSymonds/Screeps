import { JOB_PRIORITY } from "config/constants";
import { JobBoard } from "jobs/JobBoard";
import { WorldRoom } from "world/WorldRoom";

/**
 * One room-level haul job. The executor dynamically picks the best pickup and
 * sink each tick, so a single job covers all hauling in the room.
 */
export function generateHaulJobs(worldRoom: WorldRoom, board: JobBoard): void {
    const capacity = Math.min(Math.max(worldRoom.sources.length, 1), 3);
    board.upsert({
        id: `haul:${worldRoom.name}`,
        kind: "haul",
        roomName: worldRoom.name,
        capacity,
        assigned: [],
        priority: JOB_PRIORITY.haul,
        demand: { work: 0, carry: 4 }
    });
}
