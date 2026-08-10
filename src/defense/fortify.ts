/**
 * Fortification targets — ramparts/walls below their RCL-scaled target HP,
 * ascending, bounded. Pure. See docs/design/defense.md.
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
