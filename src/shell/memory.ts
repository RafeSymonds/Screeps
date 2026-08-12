/**
 * Memory bootstrap: containers, versioning, and the reset paths.
 * Owner of `Memory.version` and `Memory.shell`. See docs/design/shell.md.
 *
 * Memory is the ONLY thing that survives a global reset, so this module runs
 * before anything else each tick and guarantees one thing: whatever the rest of
 * the bot finds in Memory has the shape it expects. Three ways that can be false
 * — never initialized, written by a different schema version, or corrupted — and
 * each has an explicit answer below.
 *
 * **We do not migrate.** A version mismatch in either direction resets every
 * slice except `KEEP_ON_RESET` and alerts. That is deliberate: a migration
 * ladder is only worth its complexity once there is deployed Memory whose data
 * cannot be recomputed, and today every slice except intel and stats is derived
 * within a few hundred ticks of running. The versioning itself IS the seam — bump
 * `CURRENT_VERSION` when a schema changes and the old data is discarded safely
 * instead of being silently misread. If a future slice ever holds something
 * expensive enough to be worth carrying forward, migration belongs here, between
 * detecting the mismatch and resetting.
 */
import { SubsystemId } from "shared/subsystems";
import { alert, AlertKind, countError } from "telemetry/index";

/** Bump when any persisted schema changes shape. Old Memory is then discarded
 *  (minus KEEP_ON_RESET) rather than misread. */
export const CURRENT_VERSION = 1;

/** Slices whose containers the shell ensures. `Memory.stats` is deliberately
 *  absent: telemetry is the sole initializer of its own slice. */
export const CONTAINERS = ["rooms", "intel", "shell"] as const;

/**
 * The ONE keep-list, used by both reset paths (version mismatch, respawn).
 * A slice earns a place here only if losing it costs something we cannot cheaply
 * rebuild: `intel` is knowledge of rooms we may not be able to see again soon,
 * `stats` is the evidence trail that explains what went wrong, and `version`
 * must survive or the reset would loop. Everything else — room plans, workforce
 * state, empire registry — is derived and reappears on its own.
 */
export const KEEP_ON_RESET: readonly string[] = ["intel", "stats", "version"];

export interface ShellMemory {
    /** Room names owned as of the last completed tick — persisted so
     *  loss/respawn detection works across global resets and dead periods. */
    owned: string[];
    /** Rooms that left `owned`, with the tick we noticed. Drives grace GC. */
    lostAt: Record<string, number>;
}

function freshShellMemory(): ShellMemory {
    return { owned: [], lostAt: {} };
}

/** Repair one container in place if it is missing or the wrong shape. `shell` is
 *  checked structurally rather than by `typeof`, because a half-written slice
 *  (an object without `owned`) would otherwise pass and crash a consumer later. */
function ensureContainer(key: (typeof CONTAINERS)[number]): void {
    const mem = Memory as unknown as Record<string, unknown>;
    if (key === "shell") {
        const shell = mem.shell as ShellMemory | undefined;
        if (!shell || !Array.isArray(shell.owned) || typeof shell.lostAt !== "object" || shell.lostAt === null) {
            mem.shell = freshShellMemory();
        }
        return;
    }
    if (typeof mem[key] !== "object" || mem[key] === null) {
        mem[key] = {};
    }
}

/**
 * Establish every container. Each one is repaired independently and inside its
 * own catch: a single corrupt slice must cost us that slice, never the tick.
 */
function ensureContainers(): void {
    for (const key of CONTAINERS) {
        try {
            ensureContainer(key);
        } catch (err) {
            countError(SubsystemId.Shell, err);
            alert(AlertKind.CorruptSlice, `container ${key} reinitialized: ${String(err)}`);
            (Memory as unknown as Record<string, unknown>)[key] = key === "shell" ? freshShellMemory() : {};
        }
    }
    if (typeof Memory.creeps !== "object" || Memory.creeps === null) {
        Memory.creeps = {};
    }
}

/** Wipe every slice except `keep`, then re-establish a valid baseline. Shared by
 *  the version-mismatch path here and the respawn path in continuity.ts. */
export function resetExcept(keep: readonly string[]): void {
    const mem = Memory as unknown as Record<string, unknown>;
    for (const key of Object.keys(mem)) {
        if (!keep.includes(key)) {
            delete mem[key];
        }
    }
    ensureContainers();
    Memory.version = CURRENT_VERSION;
}

/**
 * The shell's first act each tick. Three cases, in order:
 *
 * 1. **No version** — a genuinely fresh world (or a first deploy). Establish
 *    containers and stamp the version. Nothing to preserve, nothing to alert.
 * 2. **Version mismatch**, newer *or* older — this Memory was written by code
 *    that is not this code. Reset everything outside `KEEP_ON_RESET` and alert,
 *    rather than let today's readers interpret yesterday's shapes. Rolling a
 *    deploy back is the common way to hit this, and it must be survivable.
 * 3. **Version matches** — the overwhelmingly common path. Only repair
 *    containers, which is a handful of type checks.
 */
export function ensureMemory(): void {
    const found = Memory.version;
    if (found === undefined) {
        ensureContainers();
        Memory.version = CURRENT_VERSION;
        return;
    }
    if (found !== CURRENT_VERSION) {
        resetExcept(KEEP_ON_RESET);
        alert(AlertKind.Discontinuity, `Memory version ${found} != ${CURRENT_VERSION} — reset (no migration path)`);
        return;
    }
    ensureContainers();
}
