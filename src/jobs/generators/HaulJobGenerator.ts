import { JOB_PRIORITY } from "config/constants";
import { JobBoard } from "jobs/JobBoard";
import { JobKind } from "jobs/types";
import { WorldRoom } from "world/WorldRoom";

/**
 * One room-level haul job. The executor dynamically picks the best pickup and
 * sink each tick, so a single job covers all hauling in the room.
 */
export function generateHaulJobs(worldRoom: WorldRoom, board: JobBoard): void {
    // One more slot than sources so every spawned hauler (the spawn target is
    // sources + 1) has a slot — otherwise a hauler is left permanently idle.
    const capacity = Math.min(worldRoom.sources.length + 1, 4);
    board.upsert({
        id: `haul:${worldRoom.name}`,
        kind: JobKind.Haul,
        roomName: worldRoom.name,
        capacity,
        assigned: [],
        priority: JOB_PRIORITY[JobKind.Haul],
        demand: { work: 0, carry: 4 }
    });
}
