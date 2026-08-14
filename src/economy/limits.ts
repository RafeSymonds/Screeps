/**
 * How many creeps a room can actually sustain — the real ceilings, not a constant.
 * Pure. See docs/design/economy.md "Workforce ceilings".
 *
 * ## Why this replaced a flat number
 *
 * The workforce used to be bounded by `maxCreepsPerRoom: 20`, justified as standing
 * in for "rosters that source seats, spawn throughput and energy would reject
 * anyway". Those are three real limits, and 20 was a guess at their combined
 * effect — one number for a quantity that varies by an order of magnitude across
 * the game. At RCL1 a creep is 4 parts and costs 250 energy; at RCL8 it is 40 parts
 * and costs 3000. No single headcount can be right for both.
 *
 * So each limit is computed from what it actually depends on, and the workforce
 * grows to the **least** of them. The one that binds is reported, because "why is
 * this room stuck at N creeps?" should have an answer that names a mechanism.
 *
 * ## The limits
 *
 * - **Demand** — what the room needs: sources saturated, mined energy moved,
 *   moved energy spent. Usually the binding one, and that is the healthy case.
 * - **CPU** — creep intents cost a flat 0.2 and creep execution cannot be shed, so
 *   headcount *is* CPU spend (architecture principle 8, budget.md).
 * - **Spawn throughput** — a creep takes 3 ticks per part to build and lives 1500,
 *   so one spawn can only keep `1500 / (3 × parts)` creeps alive. Ask for more and
 *   they die faster than they are replaced.
 * - **Upkeep** — replacing the workforce costs `bodyCost / 1500` energy per tick,
 *   forever. Past some share of income the room is only feeding its own creeps.
 *
 * Each is expressed as "how many MORE workers fit", because miners and haulers are
 * income infrastructure that the other limits have to accommodate rather than
 * compete with — a room that cannot afford its miners has no income to budget.
 */

export enum LimitReason {
    Demand = "demand",
    Cpu = "cpu",
    SpawnThroughput = "spawn-throughput",
    Upkeep = "upkeep"
}

/** Engine: CREEP_SPAWN_TIME — ticks of spawn occupancy per body part. */
const SPAWN_TICKS_PER_PART = 3;
/** Engine: CREEP_LIFE_TIME. */
const LIFETIME = 1500;

export interface WorkforceInput {
    /** Workers the room's production could actually keep busy. */
    wantedByDemand: number;
    /** Headroom left by the CPU allowance after income roles (budget.md). */
    cpuHeadroom: number;
    /** Spawns in the room (0 is treated as 1 — a spawnless room is rebuilding). */
    spawns: number;
    /** Body part counts of the income roles the room is committed to. */
    incomeParts: number;
    /** Body energy cost of those same income roles. */
    incomeCost: number;
    /** One worker's part count and energy cost. */
    workerParts: number;
    workerCost: number;
    /** Room income in energy per tick (sources, and anything else that lands). */
    production: number;
    /** Fraction of spawn time the workforce may occupy; the rest is slack for
     *  defenders and for replacements that arrive in bursts rather than evenly. */
    spawnDutyCeiling: number;
    /** Share of income that may go to replacing creeps rather than doing work. */
    upkeepFraction: number;
}

export interface WorkforceCeiling {
    workers: number;
    reason: LimitReason;
    /** Every limit, for diagnostics — the binding one is the min. */
    limits: Record<LimitReason, number>;
}

/**
 * The number of workers to plan for, and which ceiling produced it.
 *
 * Floors at 0 rather than going negative: when the income roles alone exceed a
 * limit, the answer is "no workers", and the planner's existing squeeze order
 * decides what gives after that.
 */
export function workerCeiling(input: WorkforceInput): WorkforceCeiling {
    const spawns = Math.max(1, input.spawns);

    // Spawn: total occupancy is 3 ticks per part per creep-lifetime. Whatever the
    // income roles do not use is available for workers.
    const spawnTicks = spawns * LIFETIME * input.spawnDutyCeiling;
    const spawnFree = spawnTicks - input.incomeParts * SPAWN_TICKS_PER_PART;
    const bySpawn = Math.floor(spawnFree / (SPAWN_TICKS_PER_PART * Math.max(1, input.workerParts)));

    // Upkeep: a creep costs its body every LIFETIME ticks, forever.
    const upkeepBudget = input.production * input.upkeepFraction;
    const upkeepFree = upkeepBudget - input.incomeCost / LIFETIME;
    const byUpkeep = Math.floor((upkeepFree * LIFETIME) / Math.max(1, input.workerCost));

    const limits: Record<LimitReason, number> = {
        [LimitReason.Demand]: Math.max(0, input.wantedByDemand),
        [LimitReason.Cpu]: Math.max(0, input.cpuHeadroom),
        [LimitReason.SpawnThroughput]: Math.max(0, bySpawn),
        [LimitReason.Upkeep]: Math.max(0, byUpkeep)
    };

    let reason = LimitReason.Demand;
    let workers = limits[LimitReason.Demand];
    // Ordered so that ties report the most actionable cause: being demand-bound is
    // the healthy state and should not be blamed on CPU that merely happens to
    // match it.
    for (const candidate of [LimitReason.Cpu, LimitReason.SpawnThroughput, LimitReason.Upkeep]) {
        if (limits[candidate] < workers) {
            workers = limits[candidate];
            reason = candidate;
        }
    }
    return { workers, reason, limits };
}
