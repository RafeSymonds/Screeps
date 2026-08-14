/**
 * The CPU allowance: architecture §9's budget table, inverted into headcounts the
 * planners consume. See docs/design/budget.md.
 *
 * ## Why planners need this at all
 *
 * Creep intents cost a flat 0.2 CPU each and creep execution is class A — the
 * scheduler cannot shed it. So workforce size *is* CPU spend, decided at planning
 * time, and the only place to enforce a CPU budget is where the workforce is
 * sized (architecture principle 8). By the time telemetry shows a room over
 * budget it is already too late: those creeps live 1500 ticks.
 *
 * ## The budget is modeled; the PRICE is measured
 *
 * The shape of the allowance comes from the design table and `Game.cpu.limit`.
 * What one creep costs does not: `cpuPerCreep` shipped as a guessed 0.35, marked
 * provisional, and the first live shard disagreed — dozens of creeps running at
 * about 12 CPU, where the guess predicted the cap should have bitten long before.
 * A wrong price multiplies by every creep in the empire, so it is the one number
 * worth learning from reality (`telemetry.measuredCpuPerCreep`).
 *
 * **This is not the feedback loop the original note refused, and the distinction
 * is the whole argument.** Feeding back TOTAL CPU oscillates: spend rises, cap
 * falls, creeps die, spend falls, cap rises, on a loop whose period is a creep
 * lifetime. Feeding back a per-creep RATE does not, because the measured quantity
 * is independent of the count — twice the creeps cost twice the CPU and leave the
 * rate unchanged, so the cap has nothing to chase. The rate is also damped and
 * clamped below, so a bad window cannot move it far.
 *
 * Detection and control still stay separate: telemetry's `CpuCeiling` alert reads
 * total CPU and is untouched by any of this.
 *
 * ## Floors beat budgets
 *
 * `minCreepsPerRoom` is applied last and unconditionally. A room too poor to fund
 * miners and haulers produces nothing and then dies, which is worse per CPU than
 * any overspend. Being modestly over share is recoverable; an empty room is not.
 */

export interface BudgetConfig {
    /** Fraction of the rated limit we plan against — §9's 20% headroom, the same
     *  0.8 expansion gates on (§5.13). */
    usableFraction: number;
    /** Per-tick costs independent of room count (§9): Memory parse ≤1 plus
     *  shell/snapshot/scheduler/telemetry ≤2. */
    fixedOverhead: number;
    /** Empire + expansion + intel refresh + scouting, amortized (§9 ≤1). */
    empireOverhead: number;
    /** §9's per-room all-in split: the owned room itself. */
    perRoomShare: number;
    /** §9's per-room all-in split: all of that room's remotes together. */
    perRemotesShare: number;
    /** The non-creep part of a room's share — planners and adapters. Subtracted
     *  before the remainder is converted into creeps. */
    roomPlannerCost: number;
    /** Fallback CPU per creep per tick, used only until the bot has measured its
     *  own. §9's estimate: a move+action creep averages ~0.3-0.4 (0.2 flat per
     *  intent). Live shards run cheaper than this. */
    cpuPerCreep: number;
    /** Clamp on the MEASURED rate, so one strange window cannot resize the empire.
     *  The floor is the engine's flat intent charge — a creep that does anything
     *  at all costs at least this, so a lower reading is a measurement artifact. */
    minMeasuredCpuPerCreep: number;
    maxMeasuredCpuPerCreep: number;
    /** Creeps one adopted remote costs all-in — miners, haulers, amortized
     *  reserver. Remotes are hauler-heavy and travel constantly. */
    creepsPerRemote: number;
    /** Viability floor: below this a room cannot run an economy at all. */
    minCreepsPerRoom: number;
    /** Upper bound on one room's workforce.
     *
     *  **This is not a CPU limit and should not be read as one** — a live shard
     *  runs dozens of creeps at ~12 CPU, far under what this implies. It is a
     *  stand-in for early-game SPAWN economics, which are measured but not yet
     *  modelled: removing it let an RCL1 room demand the 20 one-WORK workers its
     *  production could theoretically feed, and the queue then always held
     *  something affordable, so spawn energy never left the floor (sim: peaks of
     *  244 against a 300 cap, where the gate wants 250+). A room that cannot bank
     *  energy cannot fund a defender, and `raid-early` stopped clearing raiders.
     *
     *  The blocker to deleting it is named: the demand model assumes every worker
     *  upgrades every tick (`UPGRADE_CONTROLLER_POWER = 1`, 100% duty cycle). Real
     *  workers spend much of their life fetching, so the model over-asks, and
     *  uncapping it multiplies that error. Measure the duty cycle first. */
    maxCreepsPerRoom: number;
    /** Cap on remotes one home may adopt. Unlike the room workforce this stays a
     *  constant: a remote's cost is dominated by travel, which the crew budget
     *  already prices, and the count is a strategic choice rather than a physical
     *  limit. */
    maxRemotesPerHome: number;
}

export const BUDGET_CONFIG: BudgetConfig = {
    usableFraction: 0.8,
    fixedOverhead: 3,
    empireOverhead: 1,
    perRoomShare: 2.5,
    perRemotesShare: 1.5,
    roomPlannerCost: 0.5,
    cpuPerCreep: 0.35,
    minMeasuredCpuPerCreep: 0.2,
    maxMeasuredCpuPerCreep: 0.6,
    creepsPerRemote: 4,
    minCreepsPerRoom: 6,
    maxCreepsPerRoom: 20,
    maxRemotesPerHome: 3
};

export interface CpuAllowance {
    /** Cap on one owned room's workforce. */
    creepsPerRoom: number;
    /** Cap on remotes one home may adopt. */
    remotesPerHome: number;
    /** Cap on the total creeps all of a home's remotes may field.
     *
     *  Counting ROOMS alone prices every remote the same, and they are not the
     *  same: a remote two rooms out needs roughly double the haulers of one next
     *  door, because a hauler's carry requirement is set by its round trip.
     *  Charging remotes in creeps — the unit CPU is actually spent in — is what
     *  makes "further is worth less" fall out of the budget instead of needing a
     *  policy to say so. */
    remoteCreepsAllowed: number;
    /** The room's modeled share in CPU — diagnostics, and the anchor the unit
     *  test pins against architecture §9's table. */
    roomShareCpu: number;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** CPU that does NOT scale with creep count, so it must come off the top before
 *  a per-creep rate can be divided out of a measured total. */
export function nonCreepOverhead(ownedRooms: number, config: BudgetConfig = BUDGET_CONFIG): number {
    return config.fixedOverhead + config.empireOverhead + Math.max(1, ownedRooms) * config.roomPlannerCost;
}

/** Official MMO rated limit — the fallback when `Game.cpu.limit` is absent or
 *  nonsensical (see computeAllowance). */
const DEFAULT_CPU_LIMIT = 20;

/**
 * Invert §9's budget table into headcounts.
 *
 * At `cpuLimit = 20, ownedRooms = 3` this reproduces the table exactly:
 * `20 × 0.8 = 16` usable, minus 3 fixed and 1 empire leaves 12 shareable, which
 * over 3 rooms is the table's `2.5 + 1.5 = 4.0` per room. If that identity ever
 * breaks, either this code or architecture §9 moved and the other must follow —
 * the unit test pins it for exactly that reason.
 */
export function computeAllowance(
    cpuLimit: number,
    ownedRooms: number,
    config: BudgetConfig = BUDGET_CONFIG,
    /** Empirical CPU per creep, when the bot has enough evidence to know it
     *  (telemetry.measuredCpuPerCreep). Undefined falls back to the estimate. */
    measuredPerCreep?: number
): CpuAllowance {
    // Zero owned rooms happens between total loss and respawn placement. Treat it
    // as one so the division is safe and the first re-owned room gets a full share.
    const rooms = Math.max(1, ownedRooms);
    // A missing or nonsensical limit must not silently shut the empire down: the
    // arithmetic would floor remotes to 0 and creeps to the viability minimum,
    // which looks exactly like "remote mining is broken". Fall back to the
    // official-MMO limit instead — being wrong about the budget beats being
    // wrong about whether to have an economy.
    const limit = Number.isFinite(cpuLimit) && cpuLimit > 0 ? cpuLimit : DEFAULT_CPU_LIMIT;
    const usable = limit * config.usableFraction;
    const shareable = usable - config.fixedOverhead - config.empireOverhead;
    const perRoom = shareable / rooms;

    // The one number learned rather than declared. Clamped so a strange window
    // cannot resize the empire, and floored at the engine's flat intent charge —
    // a creep that acts at all costs 0.2, so anything under that is an artifact.
    const perCreep =
        measuredPerCreep !== undefined && Number.isFinite(measuredPerCreep)
            ? clamp(measuredPerCreep, config.minMeasuredCpuPerCreep, config.maxMeasuredCpuPerCreep)
            : config.cpuPerCreep;

    const shareTotal = config.perRoomShare + config.perRemotesShare;
    const roomCpu = (perRoom * config.perRoomShare) / shareTotal;
    const remotesCpu = (perRoom * config.perRemotesShare) / shareTotal;

    // floor, never round: rounding up is how a per-room budget quietly becomes an
    // overspend multiplied by the number of rooms.
    // The clamp is retained deliberately, and it is NOT the CPU limit it looks
    // like — see the config note. Everything else about the workforce ceiling is
    // now derived per room from that room's own bodies (economy/limits.ts); this
    // is the one number still standing in for something unmodelled, and it is
    // labelled as such rather than dressed up as physics.
    const creepsPerRoom = clamp(
        Math.floor((roomCpu - config.roomPlannerCost) / perCreep),
        config.minCreepsPerRoom,
        config.maxCreepsPerRoom
    );
    // Remotes floor at 0, not 1: a remote is optional income, so "cannot afford
    // one" is a legitimate answer in a way that "cannot afford an economy" is not.
    const remotesPerHome = clamp(
        Math.floor(remotesCpu / (config.creepsPerRemote * perCreep)),
        0,
        config.maxRemotesPerHome
    );
    // The same share, expressed in creeps rather than rooms. It is not a second,
    // independent budget — it is the identity `remotesPerHome × creepsPerRemote`
    // without the rounding, which is exactly what lets a remote cost what it
    // actually costs instead of the average.
    const remoteCreepsAllowed = Math.floor(remotesCpu / perCreep);

    return { creepsPerRoom, remotesPerHome, remoteCreepsAllowed, roomShareCpu: perRoom };
}
