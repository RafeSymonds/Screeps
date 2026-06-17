import { CPU_BUCKET_CRITICAL, CPU_BUCKET_HIGH, CPU_BUCKET_LOW, PIXEL_BUCKET } from "config/constants";

/**
 * CPU bucket awareness. The bucket is treated as part of gameplay: when it is
 * low, non-critical passes are stretched or skipped; when high, we mint pixels.
 */
export enum CpuTier {
    Critical = "critical",
    Low = "low",
    Normal = "normal",
    High = "high"
}

export function getTier(bucket: number = Game.cpu.bucket): CpuTier {
    if (bucket < CPU_BUCKET_CRITICAL) {
        return CpuTier.Critical;
    }
    if (bucket < CPU_BUCKET_LOW) {
        return CpuTier.Low;
    }
    if (bucket >= CPU_BUCKET_HIGH) {
        return CpuTier.High;
    }
    return CpuTier.Normal;
}

/**
 * Multiplier applied to non-critical plan intervals. Lower bucket => longer
 * effective interval => the pass runs less often.
 */
export function throttleMultiplier(tier: CpuTier = getTier()): number {
    switch (tier) {
        case CpuTier.Critical:
            return 4;
        case CpuTier.Low:
            return 2;
        case CpuTier.Normal:
            return 1;
        case CpuTier.High:
            return 1;
    }
}

export function shouldGeneratePixel(): boolean {
    return typeof Game.cpu.generatePixel === "function" && Game.cpu.bucket >= PIXEL_BUCKET;
}
