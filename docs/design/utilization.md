# Utilization — closing the loop on what the room actually does

Status: proposed (Aug 2026). Owns `Memory.rooms[name].econ.util`.
Parent: [economy.md](economy.md) "Workforce ceilings", [architecture.md](architecture.md) §3 principle 8.

## Goal

Size the workforce from **observed** behaviour rather than modelled behaviour, so a
room spends what it produces and does not carry creeps that do nothing.

The measurement that motivates this, from `rcl2-base` at 1000 ticks:

| | e/t |
| --- | --- |
| harvested | 20 |
| used (built + upgraded) | ~10 |
| **decayed on the ground** | **~9** |

Eleven standing piles — four at one source, three at the other — while sixteen
workers waited at the controller for four live haulers to carry energy 24 tiles.
Ground decay is `ceil(amount/1000)` **per pile per tick**, a flat 1 e/t floor each,
so the loss is driven by the *number* of piles, and the number of piles is driven
by production outrunning delivery.

We know it works when `(built + upgraded) / harvested` rises and standing ground
energy falls, both already recorded by telemetry's energy ledger.

## Why the modelled sizing cannot fix this

Every role is sized from a formula that assumes a **100% duty cycle**:

- workers: `production ÷ (WORK × UPGRADE_CONTROLLER_POWER)` — every worker upgrading
  every tick.
- haulers: `rate × roundTrip ÷ carry` — every hauler moving every tick, on a
  chebyshev-estimated path.

Real creeps wait for energy, queue at seats, walk further than chebyshev, and block
each other. The error is not small — a room whose model says it delivers 20 e/t was
measured delivering about half that — and it lands entirely on the ground as decay.

Three attempts to correct it from other modelled quantities all failed, and each
failure is a constraint on the design:

1. **Derive delivery from the desired hauler count.** Circular: that count is
   `rate × roundTrip ÷ carry`, so throughput comes back as `rate` identically. A
   measured no-op.
2. **Derive it from the live fleet.** Not circular, but couples worker count to a
   fleet that is itself still spawning — a wipe-recovering room collapses to one
   worker exactly when it needs to rebuild.
3. **Treat standing ground energy as extra carry demand.** Haulers and workers draw
   on one creep budget, so buying haulers removed the workers who consume the
   energy: 16 workers → 7, construction → 0, backlog *grew*. A vicious cycle.

The lesson common to all three: **a scalar derived from the same model cannot
correct that model**, and any correction that moves one role must know whether the
other role is the actual constraint.

## The signal: idleness, split by cause

Two observables, both already available or nearly so:

- **Worker duty cycle** — the fraction of a worker's ticks that actually used its
  WORK parts (Build / Upgrade / Repair). Counting `Idle` was the first version and
  it measured almost nothing: it read **0% in a room where sixteen workers were
  plainly under-used**, because a worker walking to fetch energy returns MoveTo,
  not Idle. "Has literally nothing to do" is far rarer than "is not working", and
  only the second one distinguishes the rows below.
- **Standing ground energy** — `room.dropped`, already in the snapshot.

Together they diagnose which role is short, which no single scalar can:

| ground energy | worker duty | reading | action |
| --- | --- | --- | --- |
| high | low | energy exists but is not reaching consumers — **haul-limited** | +1 hauler |
| high | high | consumers are saturated — **consumption-limited** | +1 worker |
| low | low | nothing waiting and nobody working — **over-provisioned** | −1 worker |
| low | high | balanced | hold |

This is the part the failed attempts lacked. Attempt 3 bought haulers in the
top-left *and* the bottom-left case, which is why it starved consumption.

## Interface

```ts
// src/economy/utilization.ts — pure
export interface UtilInput {
    /** Standing ground energy in TICKS OF PRODUCTION (`ground ÷ e/t`), so one
     *  threshold means the same thing in a 1-source room and a 3-source one. */
    backlogRatio: number;
    /** Fraction of worker creep-ticks that used the creep's WORK parts. */
    workerDuty: number;
    /** Current adjustment, from the slice. */
    current: UtilAdjust;
    config: UtilConfig;
}
export interface UtilAdjust { haulers: number; workers: number }
export function adjustWorkforce(input: UtilInput): UtilAdjust;
```

The output is a **delta**, applied to the planner's desired counts and then clamped
by the existing physical ceilings ([economy/limits.ts](../../src/economy/limits.ts)).
Utilization can ask for more; it can never authorise more than spawn throughput,
upkeep or CPU allow.

## Memory schema

```ts
// Memory.rooms[name].econ.util — owned by economy, written only by this pass
interface UtilMemory { v: 1; haulers: number; workers: number; at: number }
```

Bounded by `config.maxAdjust` in both directions, so the slice is two small
integers. Missing or version-mismatched → `{0, 0}`, which is exactly the current
behaviour: the loop is an adjustment to the model, never a replacement, so losing
it degrades to today rather than to nothing.

## Tick flow

Class C, one pass per room per `interval` (default 100 ticks — one telemetry
window, and ~1/15 of a creep lifetime):

1. Read the window's idle fractions and ground energy.
2. Apply the table. **At most ±1 per role per pass**, so a full swing takes many
   windows and cannot outrun the spawn queue that has to realise it.
3. Persist. The planner adds the delta to its desired counts on every subsequent
   tick; the ceilings clamp it.

Skipping under CPU pressure is safe: the delta persists and the workforce simply
stops adapting for a while.

## Edge cases

- **Bootstrap / wipe recovery.** Idle fractions are meaningless with almost no
  creeps. Gate the whole pass on the room having its income roles staffed — the
  same `bootstrapping` condition the planner already computes.
- **Oscillation.** The failure mode of attempt 3. Guarded three ways: ±1 per pass,
  a dead band around the thresholds so a room sitting near one does not flap, and
  a window (not a tick) as the unit of observation.
- **Idle for reasons headcount cannot fix** — retreating from a raid, no vision,
  no controller. These reasons are excluded from the idle fraction; only "could
  have worked, had nothing to work with" counts.
- **Global reset.** The slice persists; the tally is heap and rebuilds within a
  window.
- **Remote creeps** are owned by remotes, not economy, and are excluded from the
  room's fractions.

## Test plan

Unit (`test/unit/utilization.test.ts`), all pure:

- Each cell of the table produces its stated delta.
- The dead band: a room just inside a threshold does not flap between passes.
- Clamped at `maxAdjust` in both directions.
- ±1 per pass regardless of how far off the room is.
- A version-mismatched or absent slice reads as `{0, 0}` (degrades to today).

Sim: `rcl2-base` over ~1500 ticks, asserting on the two numbers this exists to
move — standing ground energy and pile count. **Measured against the recorded
baseline** (11 piles / 1792 energy at t=1001): the loop brought the room to
**2 piles / 31 energy** by t=1501, with extensions building faster (3 vs 1 at a
comparable tick). Both numbers come straight from the room state and the energy
ledger, so the gate measures the goal rather than a proxy for it.

That first measurement was taken with the `Idle`-based signal, which never fired
above 0% — so only the `high backlog → +worker` row was ever exercised, and the
result was right for a narrower reason than the design claims. The duty-cycle
signal above is what makes the other rows reachable.

## Open

`cpuPerCreep` and the worker duty cycle are both now measurable from the ledger
and the creep counts. This design deliberately does **not** try to compute a duty
cycle and feed it back into the formulas — that is the fourth version of the same
mistake. It closes the loop on outcomes instead, and leaves the formulas as the
starting estimate they are.
