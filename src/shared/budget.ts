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
 * ## Modeled, never measured
 *
 * The allowance comes from the design table and `Game.cpu.limit`, not from
 * observed CPU. Feeding measurements back would oscillate — spend rises, cap
 * falls, creeps die, spend falls, cap rises — on a loop whose period is a creep
 * lifetime. It would also hide the very bug telemetry's `CpuCeiling` exists to
 * report. Detection and control stay separate.
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
    /** CPU per creep per tick, all-in. §9: a move+action creep averages ~0.3–0.4
     *  (0.2 flat per intent). PROVISIONAL — needs real-MMO calibration; the sim
     *  measures isolate execution time, not the game's intent charge, so it
     *  cannot supply this number. See budget.md "Open: calibration". */
    cpuPerCreep: number;
    /** Creeps one adopted remote costs all-in — miners, haulers, amortized
     *  reserver. Remotes are hauler-heavy and travel constantly. */
    creepsPerRemote: number;
    /** Viability floor: below this a room cannot run an economy at all. */
    minCreepsPerRoom: number;
    /** Ceilings, so a large CPU subscription cannot produce rosters that source
     *  seats, spawn throughput and energy would reject anyway. */
    maxCreepsPerRoom: number;
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
    /** The room's modeled share in CPU — diagnostics, and the anchor the unit
     *  test pins against architecture §9's table. */
    roomShareCpu: number;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

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
    config: BudgetConfig = BUDGET_CONFIG
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

    const shareTotal = config.perRoomShare + config.perRemotesShare;
    const roomCpu = (perRoom * config.perRoomShare) / shareTotal;
    const remotesCpu = (perRoom * config.perRemotesShare) / shareTotal;

    // floor, never round: rounding up is how a per-room budget quietly becomes an
    // overspend multiplied by the number of rooms.
    const creepsPerRoom = clamp(
        Math.floor((roomCpu - config.roomPlannerCost) / config.cpuPerCreep),
        config.minCreepsPerRoom,
        config.maxCreepsPerRoom
    );
    // Remotes floor at 0, not 1: a remote is optional income, so "cannot afford
    // one" is a legitimate answer in a way that "cannot afford an economy" is not.
    const remotesPerHome = clamp(
        Math.floor(remotesCpu / (config.creepsPerRemote * config.cpuPerCreep)),
        0,
        config.maxRemotesPerHome
    );

    return { creepsPerRoom, remotesPerHome, roomShareCpu: perRoom };
}
