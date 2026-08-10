/**
 * Empire tunables — one named config. See docs/design/empire.md.
 */
export interface EmpireConfig {
    /** Donor search radius, in linear rooms. */
    aidRange: number;
    /** Re-homed demands are floored here: after the reserver (90), before home
     *  upgraders (100). The draft's 150 sat ABOVE every live tier, where the
     *  resolver's head-of-line break means "never spawns" (M5 mapped the band). */
    aidPriorityFloor: number;
    /** Our own policy gap between safe-mode activations (the engine's per-controller
     *  SAFE_MODE_COOLDOWN of 50k is separate and enforced by the engine). */
    grantCooldown: number;
    /** expansionWanted: average CPU must sit under this fraction of the limit. */
    cpuHeadroom: number;
}

export const EMPIRE_CONFIG: EmpireConfig = {
    aidRange: 1,
    aidPriorityFloor: 95,
    grantCooldown: 10_000,
    cpuHeadroom: 0.8
};
