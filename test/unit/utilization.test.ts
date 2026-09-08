import { expect } from "../helpers/chai";
import { UTIL_CONFIG, UtilAdjust, adjustWorkforce } from "economy/utilization";

const NONE: UtilAdjust = { haulers: 0, workers: 0 };

function step(backlogRatio: number, workerDuty: number, current: UtilAdjust = NONE): UtilAdjust {
    return adjustWorkforce({ backlogRatio, workerDuty, current });
}

/** Comfortably past each threshold, so no test sits in the dead band by accident. */
const HIGH_BACKLOG = UTIL_CONFIG.backlogHigh + 30;
const LOW_BACKLOG = UTIL_CONFIG.backlogLow - 10;
const LOW_DUTY = 0;
const HIGH_DUTY = 1;

describe("utilization loop", () => {
    it("buys HAULERS when energy stands and workers are NOT working", () => {
        // The measured case: 20 e/t harvested, ~9 decaying in eleven piles, sixteen
        // workers waiting at the controller for four haulers. Energy exists and is
        // not arriving — more consumers would idle exactly the same way.
        expect(step(HIGH_BACKLOG, LOW_DUTY)).to.deep.equal({ haulers: 1, workers: 0 });
    });

    it("buys WORKERS when energy stands and workers are saturated", () => {
        // Same backlog, opposite fix. This is the row that ground energy alone gets
        // wrong: treating a backlog as pure carry demand bought haulers here too,
        // took the slots from the consumers, and the backlog GREW.
        expect(step(HIGH_BACKLOG, HIGH_DUTY)).to.deep.equal({ haulers: 0, workers: 1 });
    });

    it("gives slots BACK when nothing is waiting and nobody is working", () => {
        // Creeps that do nothing are not free: they cost CPU every tick and their
        // own body every 1500.
        expect(step(LOW_BACKLOG, LOW_DUTY)).to.deep.equal({ haulers: 0, workers: -1 });
    });

    it("holds when the room is balanced", () => {
        expect(step(LOW_BACKLOG, HIGH_DUTY)).to.deep.equal(NONE);
    });

    it("holds inside the dead band rather than flapping", () => {
        // A room sitting between the thresholds must not add a creep one window and
        // remove it the next, forever. Both signals mid-band:
        const midBacklog = (UTIL_CONFIG.backlogLow + UTIL_CONFIG.backlogHigh) / 2;
        const midDuty = (UTIL_CONFIG.dutyLow + UTIL_CONFIG.dutyHigh) / 2;
        expect(step(midBacklog, midDuty)).to.deep.equal(NONE);
        // One signal decisive, the other mid-band: still holds, because the reading
        // needs both to be diagnostic.
        expect(step(HIGH_BACKLOG, midDuty)).to.deep.equal(NONE);
        expect(step(midBacklog, LOW_DUTY)).to.deep.equal(NONE);
    });

    it("moves at most one creep per pass, however far off the room is", () => {
        // The correction must never outrun the spawn queue that has to realise it —
        // that is how a control loop becomes an oscillation.
        expect(step(HIGH_BACKLOG * 10, LOW_DUTY)).to.deep.equal({ haulers: 1, workers: 0 });
    });

    it("clamps in both directions so the loop cannot run away", () => {
        const maxed: UtilAdjust = { haulers: UTIL_CONFIG.maxAdjust, workers: 0 };
        expect(step(HIGH_BACKLOG, LOW_DUTY, maxed)).to.deep.equal(maxed);
        const floored: UtilAdjust = { haulers: 0, workers: -UTIL_CONFIG.maxAdjust };
        expect(step(LOW_BACKLOG, LOW_DUTY, floored)).to.deep.equal(floored);
    });

    it("accumulates across passes — a persistent condition keeps moving", () => {
        let adjust = NONE;
        for (let i = 0; i < 3; i++) {
            adjust = step(HIGH_BACKLOG, LOW_DUTY, adjust);
        }
        expect(adjust).to.deep.equal({ haulers: 3, workers: 0 });
    });
});
