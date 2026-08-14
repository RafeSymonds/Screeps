/**
 * Economy tunables — one named config, all provisional. See docs/design/economy.md.
 */
export interface EconomyConfig {
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
    /** Fraction of spawn time the standing workforce may occupy (economy/limits.ts).
     *  Not 1.0: a spawn permanently busy replacing workers has nothing left for the
     *  defender a raid demands, and replacements arrive in bursts rather than
     *  evenly spaced. */
    spawnDutyCeiling: number;
    /** How many workers a single plan may ADD. The ceilings say what the room can
     *  ultimately sustain; this says how fast it may get there. */
    workerGrowthStep: number;
    /** Only grow while the room holds at least this fraction of its spawn+extension
     *  energy. This is the brake that keeps the spawn fundable. */
    growthEnergyFraction: number;
    /** Share of income that may go to REPLACING creeps rather than doing work.
     *  Upkeep is `bodyCost / 1500` per creep per tick and it never stops. Set to
     *  the PHYSICAL limit (1.0) rather than a taste: past it the room cannot
     *  sustain the roster at all and shrinks. Anything below 1.0 would be a policy
     *  preference about workforce-versus-work, and that preference is already
     *  expressed properly by sizing workers to what production can feed. */
    upkeepFraction: number;
}

export const ECONOMY_CONFIG: EconomyConfig = {
    minPickup: 20,
    prespawnLead: 50,
    downgradeFloor: 4000,
    plainsFactor: 1.1,
    tripOverhead: 8,
    containerRepairFloor: 100_000,
    controllerFeedFloor: 200,
    spawnDutyCeiling: 0.8,
    workerGrowthStep: 2,
    growthEnergyFraction: 0.5,
    upkeepFraction: 1
};
