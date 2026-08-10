/**
 * Candidate scoring — pure. See docs/design/expansion.md.
 */
import { RoomIntel, RoomType, roomType } from "intel/index";

export interface ExpansionCandidate {
    roomName: string;
    intel: RoomIntel;
    /** linearRoomDistance × 50 + 25 (tiles) — the same named proxy remotes uses. */
    travelTiles: number;
    unsafe: boolean;
    foreignReserved: boolean;
}

export function eligible(c: ExpansionCandidate): boolean {
    if (roomType(c.roomName) !== RoomType.Normal) {
        return false;
    }
    if (c.unsafe || c.intel.owner !== undefined || c.foreignReserved) {
        return false;
    }
    return c.intel.sources.length >= 1;
}

/**
 * Sources dominate, a novel mineral is a tiebreaker, distance barely matters at
 * M6's range-1 horizon — stated rather than implied: with travelTiles = 75 for
 * every adjacent room, the distance term is constant and inert until M7 widens
 * scouting.
 */
export function scoreCandidate(c: ExpansionCandidate, ownedMinerals: MineralConstant[]): number {
    const novelMineral = c.intel.mineral && !ownedMinerals.includes(c.intel.mineral.type) ? 10 : 0;
    return c.intel.sources.length * 40 + novelMineral - c.travelTiles / 5;
}
