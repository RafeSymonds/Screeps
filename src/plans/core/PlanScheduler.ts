import { ThrottleTier, PlanPriority, shouldRunThrottled, throttledInterval } from "cpu/CpuBudget";

export function shouldRunPlan(planKey: string, interval: number, tier: ThrottleTier, priority: PlanPriority): boolean {
    if (!shouldRunThrottled(tier, priority)) {
        return false;
    }

    const effectiveInterval = throttledInterval(tier, priority, interval);

    if (effectiveInterval <= 1) {
        return true;
    }

    if (!Memory.planRuns) {
        Memory.planRuns = {};
    }

    const lastRun = Memory.planRuns[planKey];

    if (lastRun === undefined || Game.time - lastRun >= effectiveInterval) {
        Memory.planRuns[planKey] = Game.time;
        return true;
    }

    return false;
}
