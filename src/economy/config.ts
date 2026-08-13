/**
 * Economy tunables — one named config, all provisional. See docs/design/economy.md.
 */
export interface EconomyConfig {
    /** Safety ceiling only. Worker count is DERIVED from what the room produces
     *  (planner: production / WORK-per-worker); this just stops a pathological
     *  input from asking for a hundred creeps. It is not the sizing mechanism. */
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
    maxWorkers: 16,
    minPickup: 20,
    prespawnLead: 50,
    downgradeFloor: 4000,
    plainsFactor: 1.1,
    tripOverhead: 8,
    containerRepairFloor: 100_000,
    controllerFeedFloor: 200
};
