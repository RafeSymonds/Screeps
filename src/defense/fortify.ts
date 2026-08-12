/**
 * Fortification targets — ramparts/walls below their RCL-scaled target HP,
 * ascending, bounded. Pure. See docs/design/defense.md.
 *
 * Ramparts are built at 1 hit and decay continuously, so "fully repaired" is not
 * a state that exists — this is a permanent, open-ended energy sink, and the
 * target HP has to scale with what the room can afford (RCL) rather than being
 * absolute. Weakest-first, because a wall is only as strong as its softest tile.
 *
 * `recentThreat` triples the target: a room that was just attacked will be
 * attacked again, and that is the moment to spend on walls rather than after the
 * next breach.
 */
import { Pos, RoomSnapshot } from "shared/views";
import { DefenseConfig } from "defense/config";

export interface FortifyTarget {
    id: Id<AnyStructure>;
    pos: Pos;
    hits: number;
    targetHits: number;
}

export function computeFortifyTargets(
    room: RoomSnapshot,
    rcl: number,
    recentThreat: boolean,
    config: DefenseConfig
): FortifyTarget[] {
    const target = (config.targetHits[rcl] ?? 0) * (recentThreat ? 3 : 1);
    if (target <= 0) {
        return [];
    }
    const walls = [...(room.structures[STRUCTURE_RAMPART] ?? []), ...(room.structures[STRUCTURE_WALL] ?? [])];
    return walls
        .filter(s => s.hits < Math.min(target, s.hitsMax))
        .sort((a, b) => a.hits - b.hits || (a.id < b.id ? -1 : 1))
        .slice(0, config.maxFortifyTargets)
        .map(s => ({ id: s.id, pos: s.pos, hits: s.hits, targetHits: target }));
}
