/**
 * Economy tunables — one named config, all provisional. See docs/design/economy.md.
 */
export interface EconomyConfig {
    /** M2 CPU allowance (principle 8): generous while ONE room owns the whole 20-CPU
     *  budget; MUST tighten when M6 makes rooms share the pie. */
    maxCreepsPerRoom: number;
    maxUpgraders: number;
    /** Haulers don't chase piles smaller than this. */
    minPickup: number;
    /** Pre-spawn lead: spawn-to-seat travel + margin (ticks). */
    prespawnLead: number;
    downgradeFloor: number;
    /** Path-length proxy multiplier over chebyshev distance. */
    plainsFactor: number;
    /** Pickup + deliver intents + queueing slack per hauler round trip (ticks). */
    tripOverhead: number;
}

export const ECONOMY_CONFIG: EconomyConfig = {
    maxCreepsPerRoom: 20,
    maxUpgraders: 8,
    minPickup: 20,
    prespawnLead: 50,
    downgradeFloor: 4000,
    plainsFactor: 1.1,
    tripOverhead: 8
};
