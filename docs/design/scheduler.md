# Scheduler Design

Status: draft — M1, revised after fresh-context review
Parent: [architecture.md](architecture.md) §5.2 (also §3 normative tick order, principle 6, §9).

## Goal

Run subsystems in a fixed, legible priority order under CPU and bucket gates, so that
degradation under load is designed rather than accidental. Success criteria:

- One (subsystem, room) invocation throwing never stops other rooms or later entries.
- When CPU/bucket is tight, class C work stops first, then B; class A always runs — and
  every skip is visible in telemetry, never silent.
- The tick order is readable in one place (the shell's entry list) and the gate logic is
  a pure function with exhaustive unit tests.

## Interface

Everything below the fold is consumed by shell (wires entries), telemetry (implements the
reporter), and every future subsystem (implements entries) — so these are cross-subsystem
contracts and live in `src/shared/` (architecture principle 3), not in the scheduler's
own directory:

```ts
// src/shared/subsystems.ts
export enum SubsystemId {
    Shell = "shell",              // pseudo-entry: shell meters its own bootstrap steps under this id
    Snapshot = "snapshot",        // pseudo-entry: shell meters snapshot construction under this id
    TelemetryFlush = "telemetryFlush",
    // grows one id per subsystem as milestones land; Offense reserved per architecture §7
}

export enum CpuClass { A = "A", B = "B", C = "C" }

// src/shared/tick.ts
export interface TickContext {
    snapshot: WorldSnapshot;      // see snapshot.md
}

// src/shared/scheduling.ts
export interface ScheduledEntry {
    id: SubsystemId;
    cpuClass: CpuClass;
    /** Class C cadence: due when (Game.time + phase) % interval === 0. */
    interval?: number;
    /** Explicit stagger offset, default 0. Set at wiring time; see Gate logic. */
    phase?: number;
    /** Scheduler iterates snapshot.myRooms, invoking run once per room (contained + metered per room). */
    perRoom?: boolean;
    run(ctx: TickContext, room?: RoomSnapshot): void;
}

/** Adapter over Game.cpu so gate logic is host-testable. */
export interface CpuMeter {
    used(): number;
    limit(): number;     // rated per-tick limit, NOT tickLimit (see Edge cases)
    bucket(): number;
}

/** Implemented by telemetry; called by the scheduler and by the shell (pseudo-entries). */
export interface SchedulerReporter {
    entryRan(id: SubsystemId, room: string | null, cpu: number): void;
    entrySkipped(id: SubsystemId, room: string | null, reason: SkipReason): void;
    entryFailed(id: SubsystemId, room: string | null, err: unknown): void;
}

export enum SkipReason { Bucket = "bucket", CpuHeadroom = "cpu" }
// note: an interval entry that is not due this tick is NOT a skip — cadence is not degradation
```

Scheduler-owned code (`src/scheduler/`):

- `index.ts` — `runTick(entries, ctx, meter, report): void`, the walk loop.
- `gates.ts` — `shouldRun(entry, meter, config, time)`, the pure gate core.
- `config.ts` — the threshold config (below).
- `meter.ts` — `gameCpuMeter: CpuMeter`, the adapter over `Game.cpu` (this subsystem's
  only `Game` access; shell passes it into `runTick`).

**Priority is array order.** `entries` comes from the shell and mirrors the architecture's
normative tick order; the scheduler never reorders. The `Shell` and `Snapshot` ids are
never in `entries` — they exist so the shell can meter its own phases through the same
reporter, keeping all per-tick CPU accounting in one shape.

### Gate logic (pure core)

`shouldRun(entry, meter, config, time): { run: true } | { run: false; reason: SkipReason }`

- Interval entries not due this tick: not invoked, not reported (cadence, not degradation).
- Class A: always runs.
- Class B: skipped when `bucket < config.bucketFloorB` or `used > config.headroomB × limit`.
- Class C: skipped when `bucket < config.bucketFloorC` or `used > config.headroomC × limit`.
- Gates re-check before **every** invocation, including each room of a `perRoom` entry, so
  a budget blown mid-tick stops lower-priority work immediately.

**Stagger is explicit data, not hashing.** Each interval entry's `phase` is set by hand at
wiring time in the shell's entries list. The shell's wiring test asserts that no two
entries with the same interval share a phase; when adding entries with different
intervals, pick phases so heavy entries don't coincide at common multiples (the wiring
test is where that judgment is recorded). A hash can't guarantee distinctness and does
nothing about common-divisor alignment — explicit data plus a test does (architecture §5
stagger requirement).

All four thresholds live in `src/scheduler/config.ts` — one named config object, the only
tunables this subsystem has. Initial values are **provisional, to be revised from
telemetry** (architecture §5.2): `bucketFloorB: 500`, `bucketFloorC: 3000`,
`headroomB: 0.9`, `headroomC: 0.7`.

### Containment and metering

Every invocation (per entry, or per (entry, room) when `perRoom`) is wrapped:

```
before = meter.used()
try { entry.run(ctx, room) ; report.entryRan(id, room, meter.used() - before) }
catch (err) { report.entryFailed(id, room, err) }   // and continue
```

What `entryFailed` does with the error (counting, logging, stack handling) is telemetry's
contract — see telemetry.md. The scheduler's job ends at containment and reporting.

Missed interval runs are **not** caught up: intervals are a cadence, not a queue. A class-C
entry skipped for CPU waits for its next due tick.

## Memory Schema

None. The scheduler is stateless by design: cadence derives from `Game.time` plus
explicit phases, gates read the meter, and priority is the entries array. A global reset
costs it nothing (architecture principle 7).

## Tick Flow

Invoked exactly once per tick by the shell, after the shell has built `TickContext`.
The scheduler walks `entries` in order applying gate → invoke → meter as above. It calls
nothing else and owns no other phase of the tick; the shell doc specs what surrounds it.

## Edge Cases

- **Overrun mid-entry.** Gates are pre-checks; there is no preemption. An entry that
  blows past the budget shows up in `entryRan` with an outsized cpu value — telemetry's
  data, alerting's job (telemetry.md), not the scheduler's.
- **`limit` vs `tickLimit`.** Gates use the rated `Game.cpu.limit`. `tickLimit` can be
  much higher when the bucket is full; planning against it would spend the bucket as
  income. The bucket is a shock absorber only (architecture §4, pixel rationale).
- **Severe throttle (bucket near zero).** Class A still runs — there is nothing left to
  shed, and A is by definition the work that must not stop (towers, creep intents).
- **No owned rooms** (post-respawn gap): `perRoom` entries iterate an empty list; no-op.
- **Duplicate ids / bad phases / non-normative order** are programmer errors: asserted by
  the shell's wiring tests (shell.md), not handled at runtime.

## Test Plan

Unit (mocha, no Screeps globals — `CpuMeter`, `SchedulerReporter`, and time injected):

- Gating matrix: each class × {bucket below/above floor} × {used below/above headroom}.
- Order: entries invoked in array order; gate re-checked between invocations (meter
  advances mid-tick and later B/C entries get skipped).
- Containment: entry 1 throws → `entryFailed`, entry 2 still runs; `perRoom` room 1
  throws → room 2 still runs.
- Metering: reported cpu equals meter delta; skips report the right `SkipReason`.
- Cadence: interval entries fire exactly on `(time + phase) % interval === 0`; distinct
  phases produce non-overlapping fire ticks for same-interval entries; a missed run is
  not caught up.

Sim: covered by the M1 smoke suite (shell.md test plan).
