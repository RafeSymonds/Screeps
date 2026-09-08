/**
 * Close the loop on what the room actually does, rather than what the formulas
 * predict it will do. Pure. See docs/design/utilization.md.
 *
 * ## The problem this exists for
 *
 * Every role is sized from a model that assumes a 100% duty cycle — workers as
 * `production ÷ WORK`, haulers as `rate × roundTrip ÷ carry`. Real creeps wait for
 * energy, queue at seats, walk further than chebyshev predicts and block each
 * other, and the error is not small: an RCL2 room measured at 20 e/t harvested,
 * ~10 e/t used, and **~9 e/t decaying on the ground** in eleven standing piles.
 *
 * ## Why one number cannot fix it
 *
 * Three corrections were tried and measured, all derived from other modelled
 * quantities, and all failed:
 *
 *  1. Delivery from the DESIRED hauler count — circular, since that count is
 *     itself `rate × roundTrip ÷ carry`. Returns production identically. A no-op.
 *  2. Delivery from the LIVE fleet — not circular, but collapses a wipe-recovering
 *     room to one worker exactly when it needs to rebuild.
 *  3. Standing ground energy as extra carry demand — haulers and workers share one
 *     creep budget, so buying haulers removed the consumers: 16 workers → 7,
 *     construction → 0, and the backlog GREW.
 *
 * Failure 3 is the instructive one. Ground energy alone cannot tell you which role
 * is short, and guessing wrong makes it worse. Idleness supplies the missing bit:
 * energy standing while workers are idle means it is not REACHING them (haul), and
 * energy standing while workers are busy means there are not enough of them
 * (consumption). Same backlog, opposite fixes.
 */

export interface UtilAdjust {
    haulers: number;
    workers: number;
}

export interface UtilConfig {
    /** Backlog above this many TICKS OF PRODUCTION standing on the ground counts
     *  as "energy is piling up". Ticks-of-production rather than raw energy so the
     *  same threshold means the same thing in a 1-source room and a 3-source one. */
    backlogHigh: number;
    /** ...and below this as "nothing is waiting". The gap between the two is a
     *  DEAD BAND: a room sitting exactly on one threshold would otherwise flap
     *  between adding and removing a creep every window. */
    backlogLow: number;
    /** Duty cycle at or above this counts as "these workers are saturated" —
     *  their WORK parts are being used, so the room can absorb more energy only by
     *  buying more of them. */
    dutyHigh: number;
    /** ...and at or below this as "these workers are not working", which with a
     *  backlog means the energy is not REACHING them. Between the two is the dead
     *  band. */
    dutyLow: number;
    /** Hard bound on how far the loop may move the modelled counts, in either
     *  direction. The model is the estimate; this is a correction to it, never a
     *  replacement, so it cannot run away even if the signals are wrong. */
    maxAdjust: number;
}

export const UTIL_CONFIG: UtilConfig = {
    backlogHigh: 60,
    backlogLow: 20,
    dutyHigh: 0.5,
    dutyLow: 0.25,
    maxAdjust: 6
};

export interface UtilInput {
    /** Standing ground energy expressed in TICKS OF PRODUCTION (`ground ÷ e/t`),
     *  so the thresholds are room-size independent. Measured at ~90 in the room
     *  this design was written from. */
    backlogRatio: number;
    /** Fraction of worker creep-ticks that actually used the creep's WORK parts.
     *  Counting only `Idle` measured almost nothing — a worker walking to fetch
     *  energy is not idle, but it is not working either, and it read 0% in a room
     *  where sixteen workers were plainly under-used. Ticks a raid or a vision gap
     *  caused are dropped upstream rather than counted as either. */
    workerDuty: number;
    current: UtilAdjust;
    config?: UtilConfig;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * One step of the loop: at most ±1 per role, so a full swing takes many windows
 * and can never outrun the spawn queue that has to realise it.
 *
 * The four cases are the whole policy:
 *
 * | backlog | worker duty | reading                     | action    |
 * | high    | low         | not reaching consumers      | +1 hauler |
 * | high    | high        | consumers saturated         | +1 worker |
 * | low     | low         | nothing waiting, none working| −1 worker |
 * | low     | high        | balanced                    | hold      |
 *
 * Anything between the thresholds is the dead band and holds — a room hovering at
 * a boundary must not add and remove the same creep forever.
 */
export function adjustWorkforce(input: UtilInput): UtilAdjust {
    const config = input.config ?? UTIL_CONFIG;
    const { backlogRatio, workerDuty, current } = input;
    const step = (v: number, d: number): number => clamp(v + d, -config.maxAdjust, config.maxAdjust);

    const backlogHigh = backlogRatio >= config.backlogHigh;
    const backlogLow = backlogRatio <= config.backlogLow;
    const dutyLow = workerDuty <= config.dutyLow;
    const dutyHigh = workerDuty >= config.dutyHigh;

    if (backlogHigh && dutyLow) {
        // Energy exists and is not arriving. More consumers would idle just the
        // same — this is the case that ground energy ALONE gets right and that
        // ground energy alone also gets wrong one row down.
        return { haulers: step(current.haulers, 1), workers: current.workers };
    }
    if (backlogHigh && dutyHigh) {
        // It IS arriving, and being consumed as fast as it lands. Buy consumption.
        return { haulers: current.haulers, workers: step(current.workers, 1) };
    }
    if (backlogLow && dutyLow) {
        // Nothing waiting and nobody working: the room is carrying creeps it does
        // not need. Give the slots back — they cost CPU and body upkeep forever.
        return { haulers: current.haulers, workers: step(current.workers, -1) };
    }
    return current;
}
