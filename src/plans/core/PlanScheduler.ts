export function shouldRunPlan(planKey: string, interval: number): boolean {
    if (interval <= 1) {
        return true;
    }

    if (!Memory.planRuns) {
        Memory.planRuns = {};
    }

    const lastRun = Memory.planRuns[planKey];

    if (lastRun === undefined || Game.time - lastRun >= interval) {
        Memory.planRuns[planKey] = Game.time;
        return true;
    }

    return false;
}
