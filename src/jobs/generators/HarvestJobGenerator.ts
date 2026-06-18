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
 * One harvest job per source, capacity 1. Static mining: a single (grown) miner
 * saturates a source's 10 energy/tick, so one seat is all the labor a source
 * needs. Extra seats only pull priority-80 harvest workers off building and
 * upgrading for redundant mining — the worst place for versatile WORK+CARRY labor.
 * Sources with no walkable seat (fully walled) get no job.
 */
export function generateHarvestJobs(worldRoom: WorldRoom, board: JobBoard): void {
    for (const source of worldRoom.sources) {
        if (countOpenSeats(source) === 0) {
            continue;
        }
        board.upsert({
            id: `harvest:${source.id}`,
            kind: JobKind.Harvest,
            roomName: worldRoom.name,
            targetId: source.id,
            capacity: 1,
            assigned: [],
            priority: JOB_PRIORITY[JobKind.Harvest],
            demand: { work: 2, carry: 1 }
        });
    }
}
