import { JOB_PRIORITY } from "config/constants";
import { JobBoard } from "jobs/JobBoard";
import { JobKind } from "jobs/types";
import { WorldRoom } from "world/WorldRoom";

/** Walkable tiles adjacent to a source — the number of creeps that can mine it at once. */
export function countOpenSeats(source: Source): number {
    const terrain = source.room.getTerrain();
    let count = 0;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) {
                continue;
            }
            const x = source.pos.x + dx;
            const y = source.pos.y + dy;
            if (x < 0 || x > 49 || y < 0 || y > 49) {
                continue;
            }
            if ((terrain.get(x, y) & TERRAIN_MASK_WALL) === 0) {
                count++;
            }
        }
    }
    return count;
}

/**
 * One harvest job per source, its capacity set to the source's walkable seats — the
 * physical limit on how many creeps can mine it at once. Capacity is the single
 * source of truth for "how many openings", so the matcher fills the closest source
 * that still has a free seat and spreads the rest across the others (its
 * least-staffed tiebreak) instead of piling every miner onto one. A fully-walled
 * source (no seat) gets no job.
 *
 * This does not cause redundant mining: a grown WORK+CARRY worker only treats harvest
 * as "needed" when there is nothing to collect (see the matcher's jobNeeded), so once
 * dedicated miners are dropping energy the spare seats stay empty and workers go
 * build/upgrade. The extra capacity matters at bootstrap, when every creep is a
 * worker and there is no dropped energy yet — then they fill the seats across both
 * sources rather than herding on the nearest one.
 */
export function generateHarvestJobs(worldRoom: WorldRoom, board: JobBoard): void {
    for (const source of worldRoom.sources) {
        const seats = countOpenSeats(source);
        if (seats === 0) {
            continue;
        }
        board.upsert({
            id: `harvest:${source.id}`,
            kind: JobKind.Harvest,
            roomName: worldRoom.name,
            targetId: source.id,
            capacity: seats,
            assigned: [],
            priority: JOB_PRIORITY[JobKind.Harvest],
            demand: { work: 2, carry: 1 }
        });
    }
}
