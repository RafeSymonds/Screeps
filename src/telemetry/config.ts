/**
 * Telemetry tunables — one named config, provisional until real telemetry data
 * revises them. See docs/design/telemetry.md.
 */
export const TELEMETRY_CONFIG = {
    /** Ticks between window flushes into the Memory.stats ring. */
    FLUSH_INTERVAL: 100,
    /** Windows kept in the ring (≈ 2000 ticks ≈ 2 hours at MMO tick rates).
     *  Sized with compact entry keys so the worst-case ring stays under the 10 KB
     *  slice budget — the size test trips as SubsystemIds grow, forcing a conscious
     *  rebalance (M2's growth to 7 ids produced the compact-key schema; M3's growth
     *  to 9 ids traded 4 windows of history). */
    RING_SIZE: 20,
    /** Reset timestamps retained for ResetLoop detection. */
    RECENT_RESETS: 5,
    RESET_LOOP_COUNT: 3,
    RESET_LOOP_WINDOW: 1000,
    /** Per-kind alert suppression window (persisted, survives resets). */
    ALERT_DEDUPE_TICKS: 1000,
    /** Explicit Game.notify grouping — the API default is 0 (no batching). */
    ALERT_GROUP_MINUTES: 30,
    /** endTick alerts only evaluate once a window has this many ticks, so a
     *  single post-reset spike tick can't trip a whole-window threshold. */
    ALERT_MIN_WINDOW_TICKS: 10,
    ERROR_BURST_THRESHOLD: 10,
    CPU_CEILING_FRACTION: 0.9
} as const;

export const STATS_VERSION = 1;
