/**
 * Movement tunables — one named config, provisional. See docs/design/movement.md.
 */
export const MOVEMENT_CONFIG = {
    /** Shared PathFinder ops budget per tick — the real limiter. */
    opsPoolPerTick: 4000,
    /** Per-search cap for in-room targets (min'd with pool remainder). */
    maxOpsPerSearch: 600,
    /** Secondary guard on search count per tick. */
    maxSearchesPerTick: 10,
    /** Unmoved-and-unfatigued this many ticks → repath around blockers. */
    stuckTicks: 2,
    plainCost: 2,
    swampCost: 10
};
