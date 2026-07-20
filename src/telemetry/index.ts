/**
 * Telemetry core: per-entry CPU, skips, errors, and reset accounting in a heap
 * window; periodic persistence into a bounded Memory.stats ring; deduped
 * Game.notify alerts. Every public function traps its own errors — a broken
 * telemetry degrades to "no evidence", never to "no tick".
 * See docs/design/telemetry.md.
 */
import { SchedulerReporter, SkipReason } from "shared/scheduling";
import { SubsystemId } from "shared/subsystems";
import { STATS_VERSION, TELEMETRY_CONFIG as CFG } from "telemetry/config";
import { log, LogLevel } from "telemetry/log";

export { log, LogLevel };

export enum AlertKind {
    ErrorBurst = "errorBurst",
    CpuCeiling = "cpuCeiling",
    ResetLoop = "resetLoop",
    RoomLost = "roomLost",
    Discontinuity = "discontinuity",
    CorruptSlice = "corruptSlice"
}

export interface EntryStats {
    cpu: number;
    runs: number;
    skips: number;
    errors: number;
}

export interface WindowStats {
    t: number;
    ticks: number;
    avgCpu: number;
    maxCpu: number;
    minBucket: number;
    entries: Record<string, EntryStats>;
}

export interface StatsMemory {
    v: number;
    logLevel: LogLevel;
    counters: { resets: number; errors: number; ticks: number };
    recentResets: number[];
    lastAlert: Partial<Record<AlertKind, number>>;
    ring: WindowStats[];
    head: number;
}

interface HeapWindow {
    ticks: number;
    totalCpu: number;
    maxCpu: number;
    minBucket: number;
    errors: number;
    entries: Record<string, EntryStats>;
}

function emptyWindow(): HeapWindow {
    return { ticks: 0, totalCpu: 0, maxCpu: 0, minBucket: Infinity, errors: 0, entries: {} };
}

let window = emptyWindow();
let currentTime = 0;

const deps = {
    notify: (message: string, groupMinutes: number): void => {
        Game.notify(message, groupMinutes);
    }
};

/** Telemetry is the sole initializer of its slice — self-heals on any access. */
function ensureStats(): StatsMemory {
    const mem = Memory as { stats?: StatsMemory };
    const s = mem.stats;
    if (!s || s.v !== STATS_VERSION || !s.counters || !Array.isArray(s.ring)) {
        mem.stats = {
            v: STATS_VERSION,
            logLevel: LogLevel.Info,
            counters: { resets: 0, errors: 0, ticks: 0 },
            recentResets: [],
            lastAlert: {},
            ring: [],
            head: 0
        };
    }
    return (mem as { stats: StatsMemory }).stats;
}

function guard(what: string, fn: () => void): void {
    try {
        fn();
    } catch (err) {
        console.log(`[telemetry] internal error in ${what}: ${String(err)}`);
    }
}

function entryStats(id: SubsystemId): EntryStats {
    let e = window.entries[id];
    if (!e) {
        e = { cpu: 0, runs: 0, skips: 0, errors: 0 };
        window.entries[id] = e;
    }
    return e;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

export function beginTick(time: number): void {
    guard("beginTick", () => {
        currentTime = time;
    });
}

export function endTick(cpuUsed: number, limit: number, bucket: number): void {
    guard("endTick", () => {
        window.ticks += 1;
        window.totalCpu += cpuUsed;
        window.maxCpu = Math.max(window.maxCpu, cpuUsed);
        window.minBucket = Math.min(window.minBucket, bucket);
        if (window.ticks >= CFG.ALERT_MIN_WINDOW_TICKS) {
            if (window.errors > CFG.ERROR_BURST_THRESHOLD) {
                alert(AlertKind.ErrorBurst, `${window.errors} errors in current window`);
            }
            if (window.totalCpu / window.ticks > CFG.CPU_CEILING_FRACTION * limit) {
                alert(AlertKind.CpuCeiling, `avg cpu ${round2(window.totalCpu / window.ticks)} vs limit ${limit}`);
            }
        }
    });
}

/** The TelemetryFlush entry's run(): fold the heap window into the ring. */
export function flush(): void {
    guard("flush", () => {
        if (window.ticks === 0) {
            return;
        }
        const stats = ensureStats();
        const entries: Record<string, EntryStats> = {};
        for (const [id, e] of Object.entries(window.entries)) {
            entries[id] = { cpu: round2(e.cpu), runs: e.runs, skips: e.skips, errors: e.errors };
        }
        stats.ring[stats.head] = {
            t: currentTime,
            ticks: window.ticks,
            avgCpu: round2(window.totalCpu / window.ticks),
            maxCpu: round2(window.maxCpu),
            minBucket: window.minBucket === Infinity ? 0 : window.minBucket,
            entries
        };
        stats.head = (stats.head + 1) % CFG.RING_SIZE;
        stats.counters.ticks += window.ticks;
        stats.counters.errors += window.errors;
        window = emptyWindow();
    });
}

/** Shell calls once per fresh heap. Persists immediately — a crash loop never flushes. */
export function countReset(time: number): void {
    guard("countReset", () => {
        currentTime = time;
        const stats = ensureStats();
        stats.counters.resets += 1;
        stats.recentResets.push(time);
        while (stats.recentResets.length > CFG.RECENT_RESETS) {
            stats.recentResets.shift();
        }
        const recent = stats.recentResets.filter(t => time - t <= CFG.RESET_LOOP_WINDOW);
        if (recent.length >= CFG.RESET_LOOP_COUNT) {
            alert(AlertKind.ResetLoop, `${recent.length} global resets within ${CFG.RESET_LOOP_WINDOW} ticks`);
        }
    });
}

export function countError(scope: SubsystemId, err: unknown): void {
    guard("countError", () => {
        entryStats(scope).errors += 1;
        window.errors += 1;
        log.error(scope, () => (err instanceof Error ? err.stack ?? err.message : String(err)));
    });
}

export function alert(kind: AlertKind, message: string): void {
    guard("alert", () => {
        const stats = ensureStats();
        const last = stats.lastAlert[kind];
        if (last !== undefined && currentTime - last < CFG.ALERT_DEDUPE_TICKS) {
            return;
        }
        stats.lastAlert[kind] = currentTime;
        deps.notify(`[${kind}] t=${currentTime} ${message}`, CFG.ALERT_GROUP_MINUTES);
    });
}

export const reporter: SchedulerReporter = {
    entryRan: (id: SubsystemId, _room: string | null, cpu: number): void => {
        guard("entryRan", () => {
            const e = entryStats(id);
            e.cpu += cpu;
            e.runs += 1;
        });
    },
    entrySkipped: (id: SubsystemId, _room: string | null, _reason: SkipReason): void => {
        guard("entrySkipped", () => {
            entryStats(id).skips += 1;
        });
    },
    entryFailed: (id: SubsystemId, room: string | null, err: unknown): void => {
        countError(id, err);
        log.debug(id, () => `entry failed in room ${room ?? "-"}`);
    }
};

export function _setNotifyForTest(fn: (message: string, groupMinutes: number) => void): void {
    deps.notify = fn;
}

export function _resetHeapForTest(): void {
    window = emptyWindow();
    currentTime = 0;
}
