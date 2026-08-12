/**
 * The tick walk: entries in priority order (array order), gate → invoke →
 * meter, with per-(entry, room) containment. Stateless by design.
 * See docs/design/scheduler.md.
 *
 * ## What the scheduler is for
 *
 * CPU overrun in Screeps does not slow you down — it *truncates the tick*, so
 * whatever had not run yet simply does not happen. That makes the order of work
 * a correctness property, not a performance tuning knob: if something must be
 * dropped, it has to be the entry we chose to drop, not whichever one happened to
 * be last. Two mechanisms give us that:
 *
 *  - **Priority = array order.** `ENTRIES` in the shell is the normative order,
 *    and it is a flat list rather than a dependency graph because a flat list is
 *    reviewable — you can read it top to bottom and know what dies first.
 *  - **CPU classes.** Class A always runs (defense, spawning, creep execution —
 *    skipping these loses creeps or rooms). Class B and C are gated on remaining
 *    headroom and bucket level, so planning and telemetry yield to survival.
 *
 * ## Stateless
 *
 * Nothing is remembered between ticks — cadence is derived from `Game.time`
 * arithmetic (`isDue`), not from counters. A global reset therefore cannot
 * desynchronize the schedule, which is the whole reason to prefer modular
 * arithmetic over "run every N calls".
 *
 * ## Containment
 *
 * Each (entry, room) invocation is trapped individually. One room's planner
 * throwing costs that room that tick, and nothing else — the loop continues, the
 * error is counted against the right subsystem, and the tick still finishes.
 */
import { CpuMeter, ScheduledEntry, SchedulerReporter } from "shared/scheduling";
import { TickContext } from "shared/tick";
import { RoomSnapshot } from "shared/views";
import { SCHEDULER_CONFIG, SchedulerConfig } from "scheduler/config";
import { isDue, shouldRun } from "scheduler/gates";

/** Run one entry, metered and contained. Failures are reported, never rethrown —
 *  the scheduler's contract is that the walk always completes. */
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

/**
 * Walk the entries once. Config is injected so gate thresholds are testable
 * without touching globals.
 *
 * The CPU gate is re-checked per room inside a `perRoom` entry, not once for the
 * entry: a five-room empire running an expensive planner should be able to serve
 * the first two rooms and skip the rest, rather than all-or-nothing. Rooms are
 * always visited in `myRooms` order, so the ones that get skipped under pressure
 * are consistently the same — deterministic starvation is debuggable, random
 * starvation is not.
 */
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
