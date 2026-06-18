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

/** One harvest job per source. Capacity is bounded by mineable seats. */
export function generateHarvestJobs(worldRoom: WorldRoom, board: JobBoard): void {
    for (const source of worldRoom.sources) {
        const seats = Math.min(countOpenSeats(source), 3);
        board.upsert({
            id: `harvest:${source.id}`,
            kind: JobKind.Harvest,
            roomName: worldRoom.name,
            targetId: source.id,
            capacity: Math.max(1, seats),
            assigned: [],
            priority: JOB_PRIORITY[JobKind.Harvest],
            demand: { work: 2, carry: 1 }
        });
    }
}
