/**
 * The tick walk: entries in priority order (array order), gate → invoke →
 * meter, with per-(entry, room) containment. Stateless by design.
 * See docs/design/scheduler.md.
 */
import { CpuMeter, ScheduledEntry, SchedulerReporter } from "shared/scheduling";
import { TickContext } from "shared/tick";
import { RoomSnapshot } from "shared/views";
import { SCHEDULER_CONFIG, SchedulerConfig } from "scheduler/config";
import { isDue, shouldRun } from "scheduler/gates";

function invoke(
    entry: ScheduledEntry,
    ctx: TickContext,
    room: RoomSnapshot | undefined,
    meter: CpuMeter,
    report: SchedulerReporter
): void {
    const before = meter.used();
    try {
        entry.run(ctx, room);
        report.entryRan(entry.id, room ? room.name : null, meter.used() - before);
    } catch (err) {
        report.entryFailed(entry.id, room ? room.name : null, err);
    }
}

export function runTick(
    entries: ScheduledEntry[],
    ctx: TickContext,
    meter: CpuMeter,
    report: SchedulerReporter,
    config: SchedulerConfig = SCHEDULER_CONFIG
): void {
    for (const entry of entries) {
        if (!isDue(entry, ctx.snapshot.time)) {
            continue;
        }
        if (entry.perRoom) {
            for (const room of ctx.snapshot.myRooms) {
                const verdict = shouldRun(entry, meter, config);
                if (!verdict.run) {
                    report.entrySkipped(entry.id, room.name, verdict.reason);
                    continue;
                }
                invoke(entry, ctx, room, meter, report);
            }
        } else {
            const verdict = shouldRun(entry, meter, config);
            if (!verdict.run) {
                report.entrySkipped(entry.id, null, verdict.reason);
                continue;
            }
            invoke(entry, ctx, undefined, meter, report);
        }
    }
}
