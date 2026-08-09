/**
 * Economy tunables — one named config, all provisional. See docs/design/economy.md.
 */
export interface EconomyConfig {
    /** M2 CPU allowance (principle 8): generous while ONE room owns the whole 20-CPU
     *  budget; MUST tighten when M6 makes rooms share the pie. */
    maxCreepsPerRoom: number;
    maxUpgraders: number;
    /** Desired builders while the room has open construction sites, else 0. While
     *  sites are open, maxUpgraders is overridden to 1 and surplus upgraders convert
     *  to builders (economy.md rule 3). */
    builders: number;
    /** Haulers/builders don't chase piles smaller than this. */
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
    maxCreepsPerRoom: 20,
    maxUpgraders: 8,
    builders: 4,
    minPickup: 20,
    prespawnLead: 50,
    downgradeFloor: 4000,
    plainsFactor: 1.1,
    tripOverhead: 8,
    containerRepairFloor: 100_000,
    controllerFeedFloor: 200
};
