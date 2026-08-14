/**
 * Movement tunables — one named config, provisional. See docs/design/movement.md.
 */
export const MOVEMENT_CONFIG = {
    /** Shared PathFinder ops budget per tick — the real limiter. */
    opsPoolPerTick: 4000,
    /** Per-search cap, in-room AND cross-room (min'd with pool remainder).
     *
     *  Raising it for cross-room goals is the obvious move — a room is 50 tiles
     *  across, so a goal two rooms out is a ~125-tile path and 600 ops buys a
     *  fraction of it. It was tried at 2000 and **broke the raid-early gate**:
     *  defenders stopped clearing a two-raider attack, because one search taking
     *  half the shared 4000-op pool defers every other creep that tick, and
     *  "walking late beats blowing the budget" applied to the creep walking at an
     *  attacker. Bisected — 600 passes, 2000 fails, nothing else changed.
     *
     *  Incomplete paths are used anyway and re-searched from closer, which is what
     *  makes the small cap survivable over long distances. The fix worth building
     *  is a cap on any ONE search's share of the pool, or ordering requests so
     *  combat outranks scouting — not a bigger number. See movement.md. */
    maxOpsPerSearch: 600,
    /** Secondary guard on search count per tick. */
    maxSearchesPerTick: 10,
    /** Unmoved-and-unfatigued this many ticks → repath around blockers. */
    stuckTicks: 2,
    plainCost: 2,
    swampCost: 10
};
