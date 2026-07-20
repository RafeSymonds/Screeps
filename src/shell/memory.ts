/**
 * Memory bootstrap: containers, versioning, migrations, and the reset paths.
 * Owner of Memory.version and Memory.shell. See docs/design/shell.md.
 */
import { SubsystemId } from "shared/subsystems";
import { alert, AlertKind, countError } from "telemetry/index";

export const CURRENT_VERSION = 1;

/** Slices whose containers the shell ensures. Memory.stats is deliberately
 *  absent: telemetry is the sole initializer of its own slice. */
export const CONTAINERS = ["rooms", "intel", "shell"] as const;

/** The ONE keep-list, used by both reset paths (version rollback, respawn).
 *  New slices are reset by default unless deliberately added here. */
export const KEEP_ON_RESET: readonly string[] = ["intel", "stats", "version"];

export interface ShellMemory {
    /** Room names owned as of the last completed tick — persisted so
     *  loss/respawn detection works across global resets and dead periods. */
    owned: string[];
    /** Rooms that left `owned`, with the tick we noticed. Drives grace GC. */
    lostAt: Record<string, number>;
}

export interface Migration {
    to: number;
    run(mem: Memory): void;
}

export const MIGRATIONS: Migration[] = [];

function freshShellMemory(): ShellMemory {
    return { owned: [], lostAt: {} };
}

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

/** Wipe every slice except KEEP_ON_RESET, then re-establish a valid baseline. */
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

export function ensureAndMigrate(migrations: Migration[] = MIGRATIONS): void {
    const found = Memory.version;
    if (found === undefined) {
        ensureContainers();
        Memory.version = CURRENT_VERSION;
        return;
    }
    if (found > CURRENT_VERSION) {
        resetExcept(KEEP_ON_RESET);
        alert(AlertKind.Discontinuity, `Memory version rollback (found ${found}) — reset to ${CURRENT_VERSION}`);
        return;
    }
    if (found < CURRENT_VERSION) {
        let version = found;
        for (const migration of migrations) {
            if (migration.to > version) {
                try {
                    migration.run(Memory);
                    version = migration.to;
                } catch (err) {
                    countError(SubsystemId.Shell, err);
                    alert(AlertKind.CorruptSlice, `migration to v${migration.to} failed: ${String(err)}`);
                }
            }
        }
        Memory.version = CURRENT_VERSION;
    }
    ensureContainers();
}
