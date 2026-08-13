/**
 * Economy tunables — one named config, all provisional. See docs/design/economy.md.
 */
export interface EconomyConfig {
    /** Ceiling on the worker residual. Workers are whatever the CPU allowance has
     *  left after income, but past a point more of them just crowd the controller
     *  and the sites — the limit is throughput, not headcount. */
    maxWorkers: number;
    /** Haulers/workers don't chase piles smaller than this. */
    minPickup: number;
    /** Pre-spawn lead: spawn-to-seat travel + margin (ticks). */
    prespawnLead: number;
    downgradeFloor: number;
    /** Path-length proxy multiplier over chebyshev distance. */
    plainsFactor: number;
    /** Pickup + deliver intents + queueing slack per hauler round trip (ticks). */
    tripOverhead: number;
    /** Repair a nearby container below this many hits (max 250k). */
    containerRepairFloor: number;
    /** Haulers deliver to the controller feed ahead of towers when its level
     *  (container energy, or standing pile at the spot) is below this. */
    controllerFeedFloor: number;
}

export const ECONOMY_CONFIG: EconomyConfig = {
    maxWorkers: 8,
    minPickup: 20,
    prespawnLead: 50,
    downgradeFloor: 4000,
    plainsFactor: 1.1,
    tripOverhead: 8,
    containerRepairFloor: 100_000,
    controllerFeedFloor: 200
};
