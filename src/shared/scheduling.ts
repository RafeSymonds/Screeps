/**
 * Scheduling contracts, shared because three parties depend on them: the shell
 * wires ScheduledEntry lists, telemetry implements SchedulerReporter, and every
 * subsystem provides entries. See docs/design/scheduler.md.
 */
import { CpuClass, SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { RoomSnapshot } from "shared/views";

export interface ScheduledEntry {
    id: SubsystemId;
    cpuClass: CpuClass;
    /** Class C cadence: due when (time + phase) % interval === 0. */
    interval?: number;
    /** Explicit stagger offset, default 0. Set at wiring time. */
    phase?: number;
    /** Scheduler iterates snapshot.myRooms, invoking run once per room (contained + metered per room). */
    perRoom?: boolean;
    run(ctx: TickContext, room?: RoomSnapshot): void;
}

/** Adapter over Game.cpu so gate logic is host-testable. */
export interface CpuMeter {
    used(): number;
    /** Rated per-tick limit, NOT tickLimit (see scheduler.md edge cases). */
    limit(): number;
    bucket(): number;
}

export enum SkipReason {
    Bucket = "bucket",
    CpuHeadroom = "cpu"
}

/** Implemented by telemetry; called by the scheduler and by the shell (pseudo-entries). */
export interface SchedulerReporter {
    entryRan(id: SubsystemId, room: string | null, cpu: number): void;
    entrySkipped(id: SubsystemId, room: string | null, reason: SkipReason): void;
    entryFailed(id: SubsystemId, room: string | null, err: unknown): void;
}
