# CPU Budget Design

Status: draft — implements architecture §3 principle 8 and §9's budget table
Parent: [architecture.md](architecture.md) §3 principle 8, §9 (CPU Budget), §5.5 (economy),
§5.10 (remotes), §5.13 (expansion's ≤80% gate).

## Goal

Turn architecture §9's budget table from a *documented intention* into an **input the
planners actually consume**. Principle 8 says CPU discipline is "enforced upstream at
planning time, not discovered downstream in telemetry" — today it is neither. Two constants
stand in for it:

- `ECONOMY_CONFIG.maxCreepsPerRoom: 20`, commented "generous while ONE room owns the whole
  20-CPU budget; MUST tighten when M6 makes rooms share the pie". M6 has landed. It did not
  tighten.
- `REMOTES_CONFIG.maxRemotesPerHome: 1`, pinned at the safe value because nothing computes
  what is affordable.

Both are wrong in the same direction the moment a second room exists: two rooms may each
spawn 20 creeps against a budget sized for one.

Success criteria:

- Creep and remote caps are **derived** from `Game.cpu.limit` and the owned-room count via
  §9's table, not hardcoded.
- A room can never be starved below viability — the floor guarantees miners and haulers.
- The allowance is a pure function, unit-tested across room counts and CPU limits.
- `maxRemotesPerHome` stops being a constant and becomes an answer.

Non-goals: closed-loop control from measured CPU (see "Modeled, not measured"), CPU
subscription / GCL-scaled limits beyond reading `Game.cpu.limit`, shard-aware budgeting.

## Modeled, not measured

The allowance is computed from the **design table**, not from telemetry's observed CPU.
This is deliberate and principle 8 says so directly: enforcement happens at planning time.
Three reasons:

1. **Stability.** A feedback loop between "CPU spent" and "creeps allowed" oscillates:
   spend rises → cap falls → creeps die → spend falls → cap rises. Workforce changes take a
   creep lifetime (1500 ticks) to express, which is far slower than the measurement window.
2. **Telemetry's role is detection.** §9: "If telemetry shows a room exceeding budget, that
   is a bug by definition, not a tuning opportunity." Feeding it back would convert a bug
   signal into a control input and hide the bug.
3. **The observation would be wrong anyway in sim.** Screeps charges a flat 0.2 CPU per
   intent; the sim harness's `Game.cpu.getUsed()` reports real isolate execution time and
   does not model intent cost at all (measured: `avgCpu ≈ 2.5` with ~15 creeps, where the
   intent charge alone would exceed that). Any calibration done against sim numbers would
   be calibrated to the wrong quantity.

Telemetry still alerts on `CpuCeiling`. That stays a fault signal.

## Interface

```ts
// src/shared/budget.ts — pure, no Game access
export interface BudgetConfig {
    /** Fraction of the rated limit we plan against. §9's 20% headroom, and the
     *  same 0.8 expansion gates on (§5.13). */
    usableFraction: number;
    /** Flat per-tick costs that exist regardless of room count (§9): Memory
     *  parse (≤1) + shell/snapshot/scheduler/telemetry (≤2). */
    fixedOverhead: number;
    /** Empire + expansion + intel refresh + scouting, amortized (§9 ≤1). */
    empireOverhead: number;
    /** §9 per-room all-in split: owned room 2.5, its remotes 1.5. */
    perRoomShare: number;
    perRemotesShare: number;
    /** Planner/adapter cost inside a room's share, i.e. the part that is NOT
     *  creep intents. Subtracted before converting the remainder to creeps. */
    roomPlannerCost: number;
    /** CPU per creep per tick, all-in. Architecture §9: a move+action creep
     *  averages ~0.3–0.4 (0.2 flat per intent). NEEDS REAL-MMO CALIBRATION —
     *  the sim cannot supply it (see "Modeled, not measured"). */
    cpuPerCreep: number;
    /** Estimated creeps a single adopted remote costs, all-in (miners + haulers
     *  + amortized reserver). Remotes are hauler-heavy and travel constantly. */
    creepsPerRemote: number;
    /** Viability floors — never starve a room below a working economy. */
    minCreepsPerRoom: number;
    /** Hard ceilings, so a large CPU subscription cannot produce absurd rosters
     *  that other limits (energy, seats) would reject anyway. */
    maxRemotesPerHome: number;
}

export interface CpuAllowance {
    /** Cap on a single owned room's workforce. */
    creepsPerRoom: number;
    /** Cap on remotes a single home may adopt. */
    remotesPerHome: number;
    /** Cap on the total creeps all of a home's remotes may field. */
    remoteCreepsAllowed: number;
    /** For telemetry/diagnostics: the room's modeled share in CPU. */
    roomShareCpu: number;
}

export function computeAllowance(cpuLimit: number, ownedRooms: number, config?: BudgetConfig): CpuAllowance;
export const BUDGET_CONFIG: BudgetConfig;
```

## The calculation

Reproducing §9's arithmetic exactly, then inverting it:

```
usable      = cpuLimit × usableFraction              // 20 × 0.8 = 16
shareable   = usable − fixedOverhead − empireOverhead // 16 − 3 − 1 = 12
perRoom     = shareable / ownedRooms                  // 12 / 3 = 4.0
```

At `cpuLimit = 20, ownedRooms = 3` this yields **4.0 CPU per room**, matching §9's
`2.5 + 1.5` line exactly — the table is the spec, and this is its inverse.

Split by the table's ratio, then convert to headcounts:

```
roomCpu     = perRoom × perRoomShare   / (perRoomShare + perRemotesShare)   // 4.0 × 2.5/4 = 2.5
remotesCpu  = perRoom × perRemotesShare/ (perRoomShare + perRemotesShare)   // 4.0 × 1.5/4 = 1.5

creepsPerRoom  = clamp( floor((roomCpu − roomPlannerCost) / cpuPerCreep),
                        minCreepsPerRoom, +inf )     // no upper clamp — see below
remotesPerHome = clamp( floor(remotesCpu / (creepsPerRemote × cpuPerCreep)),
                        0, maxRemotesPerHome )
remoteCreepsAllowed = floor(remotesCpu / cpuPerCreep)
```

**Why the remote share is expressed twice** (Aug 2026). `remotesPerHome` prices
every remote at `creepsPerRemote` — the average — and remotes are not average: the
fleet a remote needs is set by its hauler round trip, so one two borders out costs
roughly double one next door for the same income. Counting rooms therefore charges
the far one nothing for being far.

`remoteCreepsAllowed` is the identical share with the per-remote averaging removed
— `remotesPerHome × creepsPerRemote` without the rounding — so
[remotes.md](remotes.md) can spend it against each candidate's actual modelled crew.
It is **not a second, independent budget**, and it is not a licence to overspend:
both are floors of the same `remotesCpu`, so a home can never satisfy one by
violating the other. What it buys is that "further is worth less" falls out of the
arithmetic instead of needing a policy to assert it.

**Floors beat budgets.** `minCreepsPerRoom` is applied last and unconditionally. A room
that cannot fund miners and haulers produces nothing and then dies, which costs more CPU
per unit of output than any overspend — being modestly over budget is recoverable, an empty
room is not. When the floor binds, the room is knowingly over its share; that is the
correct trade and telemetry's `CpuCeiling` will say so.

**Remotes floor at 0, not 1.** Unlike a room's own economy, a remote is optional income. If
CPU is too tight to afford one, not adopting it is the right answer, and the existing
profit gate already handles "is this worth it" on the energy axis.

## Memory Schema

**None.** The allowance is a pure function of `Game.cpu.limit` and the owned-room count,
both of which are available every tick from `Game` and the snapshot. Persisting it would
create a value that can go stale against a CPU-subscription change or a room gain/loss, for
no benefit — recomputing costs a handful of arithmetic ops.

## Tick Flow

No new scheduled entry. The allowance is computed by the adapters that need it, at the
point they need it:

- **`economy/index.ts` (`runRoom`, class B)** — computes the allowance and passes
  `creepsPerRoom` into `planRoom`'s input, replacing `config.maxCreepsPerRoom`. The planner
  already treats that number as its residual budget (upgraders are what is left over), so
  this is a one-field substitution, not a restructure.
- **`remotes/index.ts` (`runPlan`, class C)** — computes the allowance and passes
  both `remotesPerHome` and `remoteCreepsAllowed` into `planAdoption`, replacing
  `config.maxRemotesPerHome`.

Both call sites already have the snapshot (for `myRooms.length`) and may read `Game.cpu.limit`
directly — reading `Game.cpu` is the scheduler-meter's declared surface and is a scalar, not
a world query, so it does not violate snapshot's traversal monopoly.

Cost: two multiplications and a division per room per run. It is not worth caching.

## Edge Cases

- **`ownedRooms === 0`** — possible between total loss and respawn. Guard: treat as 1, so
  the arithmetic cannot divide by zero and the first re-owned room gets a full share.
- **Very low `cpuLimit`** (a new account is 20; a shard with a low subscription can be less)
  — `shareable` can go to zero or negative. The clamp to `minCreepsPerRoom` handles it, and
  `remotesPerHome` correctly floors at 0.
- **Very high `cpuLimit`** (CPU subscription) — `maxRemotesPerHome`
  ceilings bind. Those exist so the allowance never outruns the *other* real limits (source
  seats, spawn throughput, energy), which would produce demands nothing can fill.
- **Room count changes mid-claim** — expansion's target is not owned until the claim lands,
  so the allowance tightens exactly when the new room starts costing CPU. That ordering is
  correct and needs no special handling.
- **Fractional results** — always `floor`. Rounding up is how a budget silently becomes an
  overspend across N rooms.

## Test Plan

Unit (`test/unit/budget.test.ts`), all pure:

- Reproduces §9's table: `computeAllowance(20, 3).roomShareCpu === 4.0`. This is the
  anchor test — if it drifts, either the code or architecture §9 changed and the other must
  follow.
- Monotonic in room count: more owned rooms → smaller per-room allowance, never larger.
- Monotonic in CPU limit: higher limit → allowance non-decreasing.
- Floor binds: at a CPU limit too small to fund a workforce, `creepsPerRoom` still equals
  `minCreepsPerRoom` and never 0.
- **No** room-workforce ceiling: at an absurd CPU limit `creepsPerRoom` keeps rising,
  because what a room can physically sustain is spawn throughput and energy upkeep and
  those are computed per room from that room's bodies (economy.md "Workforce
  ceilings"). The remote ceiling stays — a remote count is a strategic choice.
- `ownedRooms === 0` does not divide by zero.
- Remotes floor at 0 when `remotesCpu` cannot fund one, and rise above 1 when it can —
  the specific thing the hardcoded constant could never do.
- `remoteCreepsAllowed` is the same share un-averaged: at least
  `remotesPerHome × creepsPerRemote`, and shrinking with the empire like everything
  else.

Sim: no new scenario. Single-room scenarios are unaffected by design (one room gets the
whole shareable budget, so the allowance exceeds today's hardcoded 20 and nothing changes);
`m6-claim` and `m6-expand` exercise the two-room path, where the allowance tightens. The
existing gates therefore prove no regression, which is the correct bar for a change that
should be behaviour-neutral until a second room exists.

## Open: calibration

`cpuPerCreep` is the one number here that is empirical rather than architectural, and it
**cannot be measured in sim** (see "Modeled, not measured"). The value ships at
architecture §9's stated `0.35` (midpoint of "~0.3–0.4/tick for a move+action creep") and
must be revisited against the first real MMO run — the per-entry CPU in `Memory.stats.ring`
for `creeps` and `movement`, divided by live creep count, is exactly that measurement.
Until then this subsystem is *correct in structure and provisional in constant*, which is
strictly better than a hardcoded cap that is provisional in both.
