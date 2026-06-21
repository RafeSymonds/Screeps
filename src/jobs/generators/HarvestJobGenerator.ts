import { JOB_PRIORITY, MINER_WORK_PER_SOURCE } from "config/constants";
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
 * One harvest job per source. Capacity is bounded by BOTH conditions: the source's
 * walkable seats (the physical limit on simultaneous miners) and the WORK needed to
 * saturate it (MINER_WORK_PER_SOURCE = 5, since one 5-WORK miner drains a source's 10
 * e/tick). So a multi-seat source can hold several smaller miners up to 5 WORK, while
 * a single grown miner fills it in one slot — the spawn model never provisions more
 * than 5 WORK/source, so spare slots stay empty rather than over-mining.
 *
 * Harvest is reserved for DEDICATED miners: a worker (WORK+CARRY) does not treat it
 * as needed (see the matcher's jobNeeded) and mines directly via acquireEnergy only
 * as a last resort, so a WORK-only miner is never crowded out of its slot. A
 * fully-walled source (no seat) gets no job.
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
            capacity: Math.min(seats, MINER_WORK_PER_SOURCE),
            assigned: [],
            priority: JOB_PRIORITY[JobKind.Harvest],
            demand: { work: 2, carry: 1 }
        });
    }
}
