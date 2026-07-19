import { SCOUT_DANGER_STALE_MULT, SCOUT_STALE_TICKS } from "config/constants";
import { World } from "world/World";
import { RoomIntel } from "intel/types";
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

/**
 * A room a MOVE-only scout should not walk into: player-owned (towers shoot it on
 * sight) or Source Keeper (keepers kill anything near the sources). Both are
 * structural — they rarely change — so avoiding them costs almost no intel.
 * Rooms with mere hostile CREEPS are not in this set: invaders expire, and remote
 * reactivation depends on a scout re-verifying such rooms on its normal sweep.
 */
function isDangerousToScout(intel: RoomIntel): boolean {
    return intel.owner !== undefined || intel.sourceKeeper === true;
}

/**
 * Whether a neighbor's intel is due for a refresh. Never-seen rooms always are.
 * Known-dangerous rooms use a much longer staleness window (the scout death loop:
 * re-sending a scout into a room that kills it every sweep buys nothing — one
 * spawn per SCOUT_DANGER_STALE_MULT windows is enough to notice it changed hands).
 */
export function scoutDue(name: string): boolean {
    const intel = Memory.rooms[name]?.intel;
    if (!intel) {
        return true;
    }
    const staleAfter = isDangerousToScout(intel) ? SCOUT_STALE_TICKS * SCOUT_DANGER_STALE_MULT : SCOUT_STALE_TICKS;
    return Game.time - intel.lastSeen > staleAfter;
}

/**
 * The home room's neighbor with the oldest intel (never-seen rooms first).
 * Known-dangerous neighbors are skipped from the sweep entirely unless their
 * long re-check window has elapsed — a live scout keeps rotating through the
 * safe neighbors instead of dying in the dangerous one.
 */
export function stalestNeighbor(home: string): string | undefined {
    let best: string | undefined;
    let bestSeen = Infinity;
    for (const name of describeExits(home)) {
        const intel = Memory.rooms[name]?.intel;
        if (intel && isDangerousToScout(intel) && !scoutDue(name)) {
            continue;
        }
        const seen = intel?.lastSeen ?? -Infinity;
        if (seen < bestSeen) {
            bestSeen = seen;
            best = name;
        }
    }
    return best;
}
