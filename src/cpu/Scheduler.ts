import { getTier, throttleMultiplier } from "cpu/CpuBudget";
import { Phase } from "config/phases";

/**
 * Interval-based scheduling for non-critical passes, keyed by Memory.planRuns.
 * Critical passes (defense, economy) are called directly every tick and do not
 * go through here.
 */
export function shouldRun(key: Phase, interval: number): boolean {
    const last = Memory.planRuns[key];
    const effectiveInterval = interval * throttleMultiplier(getTier());
    if (last === undefined || Game.time - last >= effectiveInterval) {
        Memory.planRuns[key] = Game.time;
        return true;
    }
    return false;
}
