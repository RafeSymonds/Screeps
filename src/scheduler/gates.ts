/**
 * Pure gate logic: cadence and CPU-class gating. No Game access — the meter is
 * injected. See docs/design/scheduler.md.
 */
import { CpuMeter, ScheduledEntry, SkipReason } from "shared/scheduling";
import { CpuClass } from "shared/subsystems";
import { SchedulerConfig } from "scheduler/config";

/**
 * Interval entries fire when (time + phase) % interval === 0; non-interval
 * entries are always due.
 *
 * Deriving cadence from the clock rather than a stored counter means a global
 * reset cannot skew it. `phase` staggers entries that share an interval so their
 * costs land on different ticks instead of stacking into one CPU spike — the
 * shell's wiring test asserts phases are distinct within each interval.
 */
export function isDue(entry: ScheduledEntry, time: number): boolean {
    if (entry.interval === undefined) {
        return true;
    }
    return (time + (entry.phase ?? 0)) % entry.interval === 0;
}

export type GateVerdict = { run: true } | { run: false; reason: SkipReason };

/**
 * Should this entry run right now? Two independent brakes:
 *
 *  - **Bucket floor** — the bucket is the reserve that absorbs expensive ticks.
 *    Below the floor we stop spending on optional work so it can refill;
 *    otherwise a bad stretch never recovers.
 *  - **Headroom** — how much of *this* tick's limit is already spent. Guards
 *    against a single tick overrunning even when the bucket looks healthy.
 *
 * Class A bypasses both by design: defense, spawning and creep execution are the
 * things whose omission actually loses the game, so they run even in the red.
 */
export function shouldRun(entry: ScheduledEntry, meter: CpuMeter, config: SchedulerConfig): GateVerdict {
    if (entry.cpuClass === CpuClass.A) {
        return { run: true };
    }
    const bucketFloor = entry.cpuClass === CpuClass.B ? config.bucketFloorB : config.bucketFloorC;
    if (meter.bucket() < bucketFloor) {
        return { run: false, reason: SkipReason.Bucket };
    }
    const headroom = entry.cpuClass === CpuClass.B ? config.headroomB : config.headroomC;
    if (meter.used() > headroom * meter.limit()) {
        return { run: false, reason: SkipReason.CpuHeadroom };
    }
    return { run: true };
}
