/**
 * Per-room worker duty cycle: creep-ticks, and how many of those actually spent
 * the creep's WORK parts on something. See docs/design/utilization.md.
 *
 * ## Why this is its own module
 *
 * It is written by the creep dispatcher and read by the economy adapter, and
 * putting the accessor in either of those makes them import each other. The first
 * version did exactly that — `creeps/index` already imports `getUpgradeSpot` from
 * `economy/index`, so adding the reverse edge created a **circular import**, which
 * in a bundled ES module leaves one binding undefined at use time depending on
 * evaluation order. It also breaks the architecture rule that subsystems talk
 * through contracts rather than each other's internals.
 *
 * A leaf module both sides import has neither problem.
 *
 * ## Why duty cycle and not idleness
 *
 * Counting `Idle` was the first signal and it measured almost nothing: it read 0%
 * in a room where sixteen workers were plainly under-used, because a worker walking
 * to fetch energy returns MoveTo, not Idle. "Has literally nothing to do" is far
 * rarer than "is not working", and only the second distinguishes a room that needs
 * more delivery from one that needs more consumers.
 *
 * Heap-only and rebuilt within a window, so a global reset costs nothing.
 */

export interface WorkerUtilization {
    /** Worker creep-ticks sampled, excluding ticks headcount cannot fix. */
    total: number;
    /** Of those, ticks that put the creep's WORK parts to use. */
    working: number;
}

const byRoom = new Map<string, WorkerUtilization>();

/** Record one worker creep-tick. `working` = it used its WORK parts this tick. */
export function recordWorkerTick(roomName: string, working: boolean): void {
    const seen = byRoom.get(roomName) ?? { total: 0, working: 0 };
    seen.total += 1;
    if (working) {
        seen.working += 1;
    }
    byRoom.set(roomName, seen);
}

/**
 * Read and RESET a room's sample. Draining on read (rather than on a timer) is
 * what makes the window exactly the caller's interval, with no sample counted
 * twice and none dropped — the first version drained every tick and so measured a
 * one-tick "window", which is noise rather than a duty cycle.
 */
export function takeWorkerUtilization(roomName: string): WorkerUtilization {
    const seen = byRoom.get(roomName) ?? { total: 0, working: 0 };
    byRoom.delete(roomName);
    return seen;
}

/** Tests only — production relies on a global reset doing this for free. */
export function _clearUtilizationForTest(): void {
    byRoom.clear();
}
