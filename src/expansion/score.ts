/**
 * Candidate scoring — pure. See docs/design/expansion.md.
 *
 * Eligibility and score are separate on purpose. Eligibility is a hard filter of
 * facts that make a room impossible or illegal to take (wrong room type, already
 * owned, hostile, no sources); score ranks what is left. Folding a disqualifier
 * into the score as a large negative would let a very attractive room outweigh
 * it, which for something as expensive and slow as a claim is not a trade we ever
 * want available.
 */
import { RoomIntel, RoomType, roomType } from "intel/index";

export interface ExpansionCandidate {
    roomName: string;
    intel: RoomIntel;
    /** Border crossings from the owned room (intel's reach graph). */
    depth: number;
    /** depth × 50 + 25 (tiles) — the same named proxy remotes uses. */
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
 * Sources dominate, a novel mineral is a tiebreaker, distance discounts.
 *
 * The distance term is inert while `EXPANSION_CONFIG.maxRange` is 1 — every
 * candidate is 75 tiles out, so it subtracts the same 15 from everything. It is
 * written anyway because the horizon is now a movable number (the adapter takes
 * candidates from intel's reach graph, which goes further than expansion asks it
 * to), and a scoring function that only works at one range would silently mis-rank
 * the moment someone widened it.
 */
export function scoreCandidate(c: ExpansionCandidate, ownedMinerals: MineralConstant[]): number {
    const novelMineral = c.intel.mineral && !ownedMinerals.includes(c.intel.mineral.type) ? 10 : 0;
    return c.intel.sources.length * 40 + novelMineral - c.travelTiles / 5;
}
