import { JOB_PRIORITY } from "config/constants";
import { JobBoard } from "jobs/JobBoard";
import { JobKind } from "jobs/types";
import { WorldRoom } from "world/WorldRoom";

/**
 * One room-level build job while construction sites exist. The executor picks
 * the nearest site each tick. When sites run out, JobBoard.prune() removes it.
 */
export function generateBuildJobs(worldRoom: WorldRoom, board: JobBoard): void {
    const siteCount = worldRoom.constructionSites.length;
    if (siteCount === 0) {
        return;
    }
    board.upsert({
        id: `build:${worldRoom.name}`,
        kind: JobKind.Build,
        roomName: worldRoom.name,
        capacity: Math.min(siteCount, 3),
        assigned: [],
        priority: JOB_PRIORITY[JobKind.Build],
        demand: { work: 1, carry: 1 }
    });
}
