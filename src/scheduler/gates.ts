/**
 * Pure gate logic: cadence and CPU-class gating. No Game access — the meter is
 * injected. See docs/design/scheduler.md.
 */
import { CpuMeter, ScheduledEntry, SkipReason } from "shared/scheduling";
import { CpuClass } from "shared/subsystems";
import { SchedulerConfig } from "scheduler/config";

/** Interval entries fire when (time + phase) % interval === 0; non-interval entries are always due. */
export function isDue(entry: ScheduledEntry, time: number): boolean {
    if (entry.interval === undefined) {
        return true;
    }
    return (time + (entry.phase ?? 0)) % entry.interval === 0;
}

export type GateVerdict = { run: true } | { run: false; reason: SkipReason };

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
