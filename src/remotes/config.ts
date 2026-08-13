/**
 * Remotes tunables — one named config. See docs/design/remotes.md.
 */
export interface RemotesConfig {
    /** An armed sighting fresher than this keeps a remote unsafe (ticks). */
    unsafeMemory: number;
    /** Home must have this capacity before adopting at all. */
    minHomeCap: number;
    /** Reserve when the remote has ≥2 sources and home cap covers the floor body. */
    reserveFloorCap: number;
    /** Upgrade the reserver to the 2×CLAIM slack body at this home cap. */
    reserveSlackCap: number;
    /** Adopt only when the profit model clears this (e/t). */
    minProfit: number;
}

export const REMOTES_CONFIG: RemotesConfig = {
    unsafeMemory: 300,
    minHomeCap: 550,
    reserveFloorCap: 650,
    reserveSlackCap: 1300,
    minProfit: 2
};

/** Remote demand tiers: after home income (≤31), scout (40) and builders (50),
 *  BEFORE upgraders (100) — the resolver's head-of-line break means anything
 *  above 100 never spawns while big upgrader demands re-emit (remotes.md). */
export const PRIORITY_REMOTE_BASE = 60;
export const PRIORITY_RESERVER = 90;
