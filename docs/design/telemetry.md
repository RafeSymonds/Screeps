# Telemetry Design

Status: draft — M1 (core); extended stats sketched, built later
Parent: [architecture.md](architecture.md) §5.15 (also §2 "definition of it works", §9).

## Goal

The cheapest possible always-on evidence of what the bot did: per-entry CPU, skipped
work, errors, and global resets — the data every "why did that happen?" starts from, and
the counters the §2 seven-day MMO criteria are judged on. Success criteria:

- The class-A core costs O(scheduled entries) per tick — counters only, no scans, no
  string building on hot paths.
- Telemetry itself **never throws into the tick** and never becomes the thing that needs
  debugging: every public function traps its own errors to a plain `console.log`.
- After any incident, `Memory.stats` alone answers: was CPU the problem, what was shed,
  what threw, and when the last resets happened (`recentResets` gives the time dimension,
  `counters.resets` the lifetime total).

One refinement of architecture §5.15's wording, stated here so cold readers don't trip:
the **accounting** (inline counter calls) is class A and can't shed; the **persistence**
(folding the window into `Memory.stats`) is a sheddable class-C entry. That's safe
because the heap window is O(entries) regardless of how long it accumulates — deferring
a flush delays evidence, never grows memory.

## Interface

```ts
// src/telemetry/index.ts
export function beginTick(time: number): void;
export function endTick(cpuUsed: number, limit: number, bucket: number): void;
export function flush(): void;                    // the TelemetryFlush entry's run() — window → ring
export function countReset(time: number): void;   // shell calls once on fresh heap; see ResetLoop
export function countError(scope: SubsystemId, err: unknown): void;  // shell uses this for bootstrap errors
export const reporter: SchedulerReporter;         // entryRan / entrySkipped / entryFailed (src/shared/scheduling.ts)
// reporter.entryFailed(id, room, err) = countError(id, err) + log.error with the RAW stack —
// no ErrorMapper source-mapping on contained errors (its first call after a reset costs
// tens of CPU; mapped stacks are reserved for uncaught escapes, which ErrorMapper already handles)

// alerts — Game.notify with persisted dedupe; alerting is telemetry's job (architecture §5.15)
export enum AlertKind {
    ErrorBurst = "errorBurst", CpuCeiling = "cpuCeiling", ResetLoop = "resetLoop",
    RoomLost = "roomLost", Discontinuity = "discontinuity", CorruptSlice = "corruptSlice",
    // ^ all six exist at M1 — shell raises the last three (shell.md). Later kinds
    // (SafeModeFired, …) arrive with their owning subsystems.
}
export function alert(kind: AlertKind, message: string): void;

// leveled logging — src/telemetry/log.ts
export enum LogLevel { Debug = 0, Info = 1, Warn = 2, Error = 3 }
export const log: {
    debug(scope: SubsystemId, msg: () => string): void;   // thunks: no string work below level
    info(scope: SubsystemId, msg: () => string): void;
    warn(scope: SubsystemId, msg: () => string): void;
    error(scope: SubsystemId, msg: () => string): void;
};
```

The active level lives in `Memory.stats.logLevel` (survives resets, changeable from the
game console without a deploy: `Memory.stats.logLevel = 0`). Default `Info`; hot paths
log nothing at `Info` (architecture §5.15).

**Host access.** Telemetry reads and writes the global `Memory.stats` directly and is the
**sole initializer of its slice** — it self-heals a missing or version-mismatched
`Memory.stats` on any access, and the shell's container-ensuring explicitly excludes it
(shell.md). This makes `countReset` safe to call even before the shell's bootstrap step.
`Game.notify` is called through an internal `deps.notify` seam with a test-only setter;
unit tests use the repo's mocked `Memory` global (`test/helpers/`) plus the notify seam.

### Accumulation model

Per-tick data accumulates in a **heap window** (plain counters: ticks, total/max cpu, min
bucket, per-entry `{cpu, runs, skips, errors}`). The class-C scheduler entry
(`SubsystemId.TelemetryFlush`, `interval: FLUSH_INTERVAL`) calls `flush()`, which folds
the window into the persistent ring and resets it. Only `countReset` and `alert` write
Memory outside of `flush` — both are reset-adjacent paths that cannot wait for a flush
that may never come.

## Memory Schema

Owner of `Memory.stats` (architecture §6). Size budget: **≤ 10 KB serialized** — the ring
is the only growing part, and its size is `RING_SIZE × (entries per window)`; the unit
tests serialize a full worst-case ring and assert the budget.

```ts
interface StatsMemory {
    v: 1;                        // slice-local version; telemetry reinitializes on mismatch
    logLevel: LogLevel;
    counters: { resets: number; errors: number; ticks: number };  // lifetime totals
    recentResets: number[];      // Game.time of the last ≤ RECENT_RESETS resets (drives ResetLoop)
    lastAlert: Partial<Record<AlertKind, number>>;  // per-kind dedupe stamps — persisted, so
                                                    // reset loops can't cause an email per reset
    ring: WindowStats[];         // bounded circular buffer, RING_SIZE entries
    head: number;                // next write index
}

interface WindowStats {
    t: number;                   // Game.time at flush
    ticks: number;               // ticks accumulated (≤ FLUSH_INTERVAL; resets truncate —
                                 // short windows are themselves evidence of reset churn)
    avgCpu: number; maxCpu: number; minBucket: number;
    /** Compact keys — c: cpu, r: runs, s: skips, e: errors — this record is multiplied
     *  by RING_SIZE × every SubsystemId, and readable keys blew the 10 KB budget the
     *  moment M2 grew the enum (the size test caught it, as designed). */
    entries: Record<string /* SubsystemId */, { c: number; r: number; s: number; e: number }>;
}
```

Missing or version-mismatched `Memory.stats` reinitializes fresh (stats are evidence, not
state — losing them is always acceptable, corrupting the tick over them never is).

Provisional constants in `src/telemetry/config.ts` (one named config; revised from real
data): `FLUSH_INTERVAL: 100`, `RING_SIZE: 20` (≈ 2000 ticks ≈ 2 hours at MMO tick
rates; sized with the compact entry keys to keep the worst-case ring under the 10 KB
budget — the size test trips as `SubsystemId` grows, forcing a conscious rebalance;
M2's growth to 7 ids was the first trip and produced the compact-key schema, M3's
growth to 9 traded four windows of history),
`RECENT_RESETS: 5`, `ALERT_DEDUPE_TICKS: 1000`, `ALERT_GROUP_MINUTES: 30`, alert
thresholds below.

## Tick Flow

- `beginTick` (from shell): start window tick. Heap-only; safe at any point in bootstrap.
- During the tick: `reporter.*` calls from the scheduler **and from the shell's
  pseudo-entries** (`Shell`, `Snapshot` — scheduler.md); `log.*` and `countError` from
  anywhere.
- `endTick(cpuUsed, limit, bucket)` (from shell, last thing): fold into the window;
  evaluate `ErrorBurst` and `CpuCeiling` on window aggregates (cheap arithmetic, no
  scans — `limit` is a parameter precisely so this needs no `Game` read).
- On `TelemetryFlush` due ticks (class C): `flush()` — window → ring, persistent counters
  updated, window reset. If flush is shed under CPU pressure, the window keeps
  accumulating — O(entries) regardless of duration; the next flush covers a longer window
  (`ticks` records how long).

### Alerts

`Game.notify`'s `groupInterval` **defaults to 0 (no batching)** — every alert passes
`ALERT_GROUP_MINUTES` explicitly. Messages are truncated to 1000 chars by the API; alert
messages are written short. Dedupe is per kind via the **persisted** `lastAlert` stamp:
suppressed for `ALERT_DEDUPE_TICKS` after each send, surviving resets — a persistent
condition plus a reset loop yields one email per dedupe window, not one per reset.

- `ErrorBurst`: window errors > threshold (provisional: 10/window). Evaluated at endTick.
- `CpuCeiling`: window avgCpu > 90% of `limit`. Evaluated at endTick.
- Both endTick alerts only evaluate once the window holds ≥ `ALERT_MIN_WINDOW_TICKS`
  (provisional: 10) ticks, so a single post-reset spike tick can't trip a whole-window
  threshold on its own.
- `ResetLoop`: evaluated **inside `countReset`**, not from window data — a crash loop
  kills windows before they flush, so window-based detection can structurally never see
  it. `countReset(time)` pushes `time` onto `recentResets` (bounded to `RECENT_RESETS`),
  persists immediately, and alerts when ≥ `RESET_LOOP_COUNT` (provisional: 3) of them
  fall within `RESET_LOOP_WINDOW` ticks (provisional: 1000).

## Edge Cases

- **Telemetry must not lie about itself**: `flush` runs as a scheduled entry, so its cost
  appears in the ring like everyone else's.
- **Unflushed window lost on reset** — accepted; `recentResets` (persisted immediately)
  plus shortened `ticks` in surrounding windows make the gap visible rather than silent.
- **Internal failure**: every public function body is wrapped; on error it
  `console.log`s once and returns. A broken telemetry module degrades to "no evidence",
  never to "no tick".
- **Entry set changes across deploys**: `WindowStats.entries` is keyed by id string;
  old windows with stale ids remain readable history, no migration needed.
- **Console spam**: `log` gates by level before evaluating the message thunk; there is no
  per-creep logging API on purpose — if a subsystem needs per-creep tracing, that's a
  `Debug`-level scoped message it pays for only when Debug is switched on.

## Test Plan

Unit (mocha; mocked `Memory` global from `test/helpers/`, notify captured via the test
seam, time and cpu values passed as arguments — nothing reads `Game`):

- Window math: entryRan/Skipped/Failed accumulate; endTick folds avg/max/min correctly;
  `flush()` produces the expected `WindowStats` and resets the window.
- Ring: wraps at `RING_SIZE`, `head` advances, oldest overwritten.
- Counters: `countReset` persists `recentResets` immediately (bounded); errors/ticks
  persist at flush; `countError` and `reporter.entryFailed` both land in the window.
- Alerts: `ResetLoop` — three `countReset` calls within the window ticks fire exactly one
  notify (persisted dedupe suppresses the rest, including across a simulated heap wipe);
  `CpuCeiling` uses the `endTick` limit argument; `ErrorBurst` threshold; every notify
  call carries `ALERT_GROUP_MINUTES`.
- Log gating: below-level thunks are never invoked (spy on thunk).
- Self-containment: a throwing injected notify/Memory access is swallowed (console spy),
  tick code path returns normally.
- Size budget: worst-case ring (all current SubsystemIds × RING_SIZE) serializes ≤ 10 KB.

Sim: M1 smoke (shell.md) asserts `Memory.stats.ring` is non-empty after enough ticks and
`counters.errors` stays 0 across the run.
