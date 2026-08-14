/**
 * Telemetry core: per-entry CPU, skips, errors, and reset accounting in a heap
 * window; periodic persistence into a bounded Memory.stats ring; deduped
 * Game.notify alerts. Every public function traps its own errors — a broken
 * telemetry degrades to "no evidence", never to "no tick".
 * See docs/design/telemetry.md.
 *
 * ## The problem this solves
 *
 * A Screeps bot runs unattended for days at a time and nobody is watching when it
 * breaks. So the requirement is not "logging" — it is that after the fact, from
 * Memory alone, you can answer: what was CPU doing, which subsystem burned it,
 * what threw, and how often did the global reset. That has to be true even for
 * the ticks nobody saw, which rules out `console.log` as the record of truth.
 *
 * ## Heap window → Memory ring
 *
 * Accumulating per-entry stats straight into Memory would mean re-serializing the
 * whole slice every tick — expensive, and pointless since only the aggregate
 * matters. Instead stats accumulate in a heap `window`, and every
 * `FLUSH_INTERVAL` ticks the window is folded into a fixed-size ring buffer in
 * Memory. The ring is bounded, so the slice never grows; it wraps, so the recent
 * past is always available and the distant past costs nothing.
 *
 * The tradeoff is real and accepted: a global reset loses up to one unflushed
 * window. The two things a reset must NOT lose — the reset count itself and
 * alerts — are written straight through to Memory instead, because a crash loop
 * is exactly the case where the window never survives to be flushed.
 *
 * ## Everything here is guarded
 *
 * Every exported function wraps its body in `guard`. Telemetry sits inside the
 * hot path of every other subsystem, and an exception raised while *recording* a
 * problem would convert a contained failure into a dead tick. Failures degrade to
 * a `console.log` and nothing more.
 */
import { SchedulerReporter, SkipReason } from "shared/scheduling";
import { SubsystemId } from "shared/subsystems";
import { STATS_VERSION, TELEMETRY_CONFIG as CFG } from "telemetry/config";
import { log, LogLevel } from "telemetry/log";

export { log, LogLevel };

/**
 * Things worth waking a human for. Each kind dedupes independently on its own
 * timer, so a room falling over does not suppress the alert about CPU.
 */
export enum AlertKind {
    ErrorBurst = "errorBurst",
    CpuCeiling = "cpuCeiling",
    ResetLoop = "resetLoop",
    RoomLost = "roomLost",
    Discontinuity = "discontinuity",
    CorruptSlice = "corruptSlice",
    SafeMode = "safeMode",
    ExpansionStalled = "expansionStalled"
}

export interface EntryStats {
    cpu: number;
    runs: number;
    skips: number;
    errors: number;
}

/** Compact keys (c: cpu, r: runs, s: skips, e: errors) — multiplied by RING_SIZE ×
 *  every SubsystemId, readable keys blow the 10 KB slice budget. */
export interface WindowEntryStats {
    c: number;
    r: number;
    s: number;
    e: number;
}

export interface WindowStats {
    t: number;
    ticks: number;
    avgCpu: number;
    maxCpu: number;
    minBucket: number;
    /** Mean live creep count over the window. Paired with avgCpu this is the ONLY
     *  way to learn what a creep actually costs — see shared/budget.ts, which
     *  shipped a guessed 0.35 for want of exactly this measurement. */
    avgCreeps: number;
    entries: Record<string, WindowEntryStats>;
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
    totalCreeps: number;
    errors: number;
    entries: Record<string, EntryStats>;
}

function emptyWindow(): HeapWindow {
    return { ticks: 0, totalCpu: 0, maxCpu: 0, minBucket: Infinity, totalCreeps: 0, errors: 0, entries: {} };
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

/** Containment for telemetry itself: recording a failure must never cause one.
 *  Deliberately falls back to raw console — the alerting path may be what broke. */
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

/**
 * Close the tick: fold this tick's totals into the window and check the two
 * standing alarms. Both are evaluated on the *window*, not the tick, and only
 * once the window has enough ticks to mean something — a single expensive tick
 * during a base rebuild is normal, a sustained average at the ceiling is not.
 */
export function endTick(cpuUsed: number, limit: number, bucket: number, creeps = 0): void {
    guard("endTick", () => {
        window.ticks += 1;
        window.totalCpu += cpuUsed;
        window.totalCreeps += creeps;
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

/**
 * The TelemetryFlush entry's run(): fold the heap window into the ring.
 * Runs last in the normative tick order so the window it writes is complete.
 * `head` advances modulo RING_SIZE — the ring overwrites its oldest entry rather
 * than growing, which is what keeps the stats slice under its size budget forever.
 */
export function flush(): void {
    guard("flush", () => {
        if (window.ticks === 0) {
            return;
        }
        const stats = ensureStats();
        const entries: Record<string, WindowEntryStats> = {};
        for (const [id, e] of Object.entries(window.entries)) {
            entries[id] = { c: round2(e.cpu), r: e.runs, s: e.skips, e: e.errors };
        }
        stats.ring[stats.head] = {
            t: currentTime,
            ticks: window.ticks,
            avgCpu: round2(window.totalCpu / window.ticks),
            maxCpu: round2(window.maxCpu),
            avgCreeps: round2(window.totalCreeps / window.ticks),
            minBucket: window.minBucket === Infinity ? 0 : window.minBucket,
            entries
        };
        stats.head = (stats.head + 1) % CFG.RING_SIZE;
        stats.counters.ticks += window.ticks;
        stats.counters.errors += window.errors;
        window = emptyWindow();
    });
}

/**
 * §6-blessed read: the empirical cost of a creep, in CPU per tick, averaged over
 * every window in the ring that had creeps in it.
 *
 * `budget.ts` shipped a **guessed** 0.35 for this, marked PROVISIONAL, because the
 * sim measures isolate execution time rather than the game's intent charge and so
 * cannot supply it. A live shard can: it has both numbers already, and the ring
 * spans thousands of ticks.
 *
 * Overheads are subtracted before dividing, because they do not scale with creeps.
 * They are themselves modelled numbers, so the result is only as good as they are —
 * but being wrong about a couple of CPU spread over dozens of creeps is a far
 * smaller error than being wrong about the per-creep rate itself, which multiplies.
 *
 * Returns undefined until there is enough evidence to beat a guess.
 */
export function measuredCpuPerCreep(nonCreepOverhead: number, minWindows = 3): number | undefined {
    const stats = Memory.stats;
    if (!stats?.ring) {
        return undefined;
    }
    let cpu = 0;
    let creeps = 0;
    let windows = 0;
    for (const w of stats.ring) {
        // avgCreeps is absent on windows written before this shipped; those are
        // unusable rather than zero-creep, and treating them as zero would divide
        // real CPU by nothing.
        if (!w || typeof w.avgCreeps !== "number" || w.avgCreeps <= 0) {
            continue;
        }
        cpu += w.avgCpu;
        creeps += w.avgCreeps;
        windows += 1;
    }
    if (windows < minWindows || creeps <= 0) {
        return undefined;
    }
    const creepCpu = cpu - nonCreepOverhead * windows;
    return creepCpu > 0 ? creepCpu / creeps : undefined;
}

/** §6-blessed read of the stats slice — expansion's CPU-headroom gate needs the
 *  last full window's average and must not reach into Memory.stats directly. */
export function lastWindowAvgCpu(): number | undefined {
    const stats = Memory.stats;
    if (!stats?.ring || stats.ring.length === 0) {
        return undefined;
    }
    const idx = (stats.head - 1 + stats.ring.length) % stats.ring.length;
    return stats.ring[idx]?.avgCpu;
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

/**
 * Notify a human, at most once per `ALERT_DEDUPE_TICKS` per kind. The dedupe
 * timestamp lives in Memory rather than heap on purpose: a reset loop is a
 * condition that *causes* the heap to vanish, and a heap-based dedupe would mail
 * on every single reset.
 */
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

/** The scheduler's sink. Kept as an object literal implementing a shared
 *  interface so the scheduler depends on the contract, never on this module. */
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
