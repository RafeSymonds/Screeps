/**
 * Remotes tunables — one named config. See docs/design/remotes.md.
 */
export interface RemotesConfig {
    /** An armed sighting fresher than this keeps a remote unsafe (ticks). */
    unsafeMemory: number;
    /** Reserve when the remote has ≥2 sources and home cap covers the floor body. */
    reserveFloorCap: number;
    /** Upgrade the reserver to the 2×CLAIM slack body at this home cap. */
    reserveSlackCap: number;
    /** Adopt only when the profit model clears this (e/t). */
    minProfit: number;
    /** How many room transitions out we are willing to mine. */
    maxDepth: number;
}

export const REMOTES_CONFIG: RemotesConfig = {
    unsafeMemory: 300,
    reserveFloorCap: 650,
    reserveSlackCap: 1300,
    minProfit: 2,
    // Two rooms out. The profit model already charges for distance — haulers are
    // sized by round trip, so depth 3 costs roughly double depth 1's hauling — and
    // it keeps clearing minProfit well past where a remote is a good idea, because
    // the things that actually break down over distance are not in it: the CPU of
    // twice the haulers, the spawn-ticks to keep them replaced, the extra rooms of
    // route where an invader can end a trip. This cap is that unmodelled cost,
    // stated as a number rather than pretended away.
    maxDepth: 2
};

/** Remote demand tiers: after home income (≤31), scout (40) and builders (50),
 *  BEFORE upgraders (100) — the resolver's head-of-line break means anything
 *  above 100 never spawns while big upgrader demands re-emit (remotes.md). */
export const PRIORITY_REMOTE_BASE = 60;
export const PRIORITY_RESERVER = 90;
