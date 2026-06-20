import { World } from "world/World";
import { describeExits } from "intel/adjacency";
import { moveToRoom } from "actions/primitives";
import { recordRoomIntel } from "intel/Scouting";

/**
 * Imperative command for a scout creep (controller tag `scout:<home>`). A scout
 * is a single MOVE body that rotates through its home room's neighbors gaining
 * vision. The moment it stands in a neighbor it records fresh intel, which ages
 * that room out of "most stale" so the next tick it targets a different one —
 * giving a self-rotating sweep with no per-creep target memory.
 */
export function commandScout(creep: Creep, world: World): void {
    if (creep.room.name !== creep.memory.home) {
        const here = world.getRoom(creep.room.name);
        if (here) {
            recordRoomIntel(here);
        }
    }

    const target = stalestNeighbor(creep.memory.home);
    if (target && creep.room.name !== target) {
        moveToRoom(creep, target);
    }
}

/** The home room's neighbor with the oldest intel (never-seen rooms first). */
export function stalestNeighbor(home: string): string | undefined {
    let best: string | undefined;
    let bestSeen = Infinity;
    for (const name of describeExits(home)) {
        const seen = Memory.rooms[name]?.intel?.lastSeen ?? -Infinity;
        if (seen < bestSeen) {
            bestSeen = seen;
            best = name;
        }
    }
    return best;
}
