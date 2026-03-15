export enum ThrottleTier {
    CRITICAL = "critical",
    LOW = "low",
    NORMAL = "normal",
    SURPLUS = "surplus"
}

export type PlanPriority = "critical" | "important" | "optional";

const CRITICAL_BUCKET = 1000;
const LOW_BUCKET = 3000;
const SURPLUS_BUCKET = 9000;

export function computeThrottleTier(): ThrottleTier {
    const bucket = Game.cpu.bucket;

    if (bucket < CRITICAL_BUCKET) return ThrottleTier.CRITICAL;
    if (bucket < LOW_BUCKET) return ThrottleTier.LOW;
    if (bucket >= SURPLUS_BUCKET) return ThrottleTier.SURPLUS;
    return ThrottleTier.NORMAL;
}

export function shouldRunThrottled(tier: ThrottleTier, priority: PlanPriority): boolean {
    if (priority === "critical") return true;

    if (tier === ThrottleTier.CRITICAL) return false;

    if (tier === ThrottleTier.LOW && priority === "optional") return false;

    return true;
}

export function throttledInterval(tier: ThrottleTier, priority: PlanPriority, baseInterval: number): number {
    if (priority === "critical") return baseInterval;

    if (tier === ThrottleTier.LOW && priority === "important") {
        return baseInterval * 2;
    }

    return baseInterval;
}

export function trackCpuUsage(): void {
    if (Game.cpu.bucket >= SURPLUS_BUCKET && typeof Game.cpu.generatePixel === "function") {
        Game.cpu.generatePixel();
    }
}
