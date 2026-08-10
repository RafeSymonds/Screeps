# Empire — The Thin Strategy Layer

Status: M6 scope, revised after fresh-context review (aid re-scoped to the rebuild
skeleton, priority band fixed, safe-mode serialization against the engine's same-tick
cancellation, ring arithmetic redone). Owns `Memory.empire`. Architecture §5.14.

## Goal

The few decisions that genuinely cross room boundaries: room registry + lifecycle,
the expansion trigger, spawn aid for a room that lost its spawn, and safe-mode
arbitration. Rooms never read each other's state.

## Interface

```ts
// src/empire/registry.ts — pure. ORDERED rules (review: a fresh claim matched two
// states; the order IS the spec):
//   1. no spawns AND this room is expansion's active claim target → Bootstrapping
//   2. no spawns → Crippled
//   3. rcl < 2 and homedCreeps < 5 → Bootstrapping
//   4. homedCreeps === 0 AND energyAvailable < 300 → Crippled
//      (the energy conjunct is what keeps a healthy room's 2-tick generation gap
//      from misclassifying — spawn-side energy is full mid-turnover)
//   5. Stable
export enum RoomLifecycle { Bootstrapping = "bootstrapping", Stable = "stable", Crippled = "crippled" }
function classify(room: RoomSnapshot, homedCreeps: number, claimTarget: string | undefined): RoomLifecycle;

// src/empire/aid.ts — pure
function brokerAid(demands: SpawnDemand[], registry, config): SpawnDemand[];

// src/empire/index.ts — accessors
export function getLifecycle(roomName: string): RoomLifecycle | undefined;
export function requestSafeMode(roomName: string, ctx: TickContext): boolean;  // the arbiter
export function confirmSafeMode(time: number): void;          // stamp on engine OK only
export function expansionWanted(): boolean;

// src/empire/config.ts — enumerated like every other config (review: they weren't)
export const EMPIRE_CONFIG = {
    aidRange: 1,            // linear rooms, Game.map.getRoomLinearDistance
    aidPriorityFloor: 95,   // AFTER reserver 90, BEFORE upgraders 100 — inside the
                            // live band. (The draft's 150 sat above everything =
                            // head-of-line-starved forever; M5 mapped this band.)
    grantCooldown: 10_000   // policy between OUR activations (the engine's 50k
                            // SAFE_MODE_COOLDOWN is per-controller and separate)
};
```

New vocabulary: `SubsystemId.Empire` (C) + `SubsystemId.EmpireAid` (B). With
Expansion's two ids (expansion.md), M6 lands **18** SubsystemIds → **RING_SIZE 14 →
11** (the 10 KB worst-case test is the arbiter and it passes at 11). 11 windows ≈
1100 ticks of ring history;
§2's 7-day CPU criterion is answered from cumulative counters, not the ring — stated
in telemetry.md with the change. Telemetry also grows an accessor
`lastWindowAvgCpu(): number | undefined` (the expansion trigger's CPU gate — §6
forbids reading the stats slice directly, and no accessor existed).

## Aid — re-scoped to what actually needs brokering

The review killed the generic version twice over: a spawnless room emits **zero**
demands (economy returns early with no spawn), so there was nothing to re-home; and
the has-spawn-but-poor case self-heals (the engine regenerates spawn energy +1/tick
below 300, and MINER_MIN_BODY costs 200). What genuinely needs a donor is **the room
that lost its spawn** — pre-M6, architecture §5.9 explicitly says no neighbor can
rebuild it. So:

- **Economy delta (M6)**: for an owned room with NO spawn, `planRoom` emits the
  **rebuild skeleton** instead of bailing: 1 miner + 1 hauler + `builders` (4)
  builder demands, `home` = the spawnless room, normal income priorities. Layout
  keeps the room's plan (wipe case — M3 rule), construction's spawnless exception
  places `spawn[0]`, builders rebuild it. That path exists and is sim-proven except
  for who spawns the bodies — which is exactly what aid supplies.
- **EmpireAid (class B, every tick, ordered after the per-room producers and before
  Spawn — the scheduler's subsystem-major sweep supports this)**: rewrite `home` —
  and ONLY `home` (review: state the fields; ids keep encoding the origin room, and
  the resolver names creeps from the new home — accepted cosmetic) — on demands
  homed to Crippled rooms, to the nearest Stable room within `aidRange`, flooring
  priority at `aidPriorityFloor`. The spawned creep carries `memory.home` = the
  crippled room and the M5 travel rule walks it there (verified against the
  dispatcher: work room keys off assignment, never home). The floor **demotes as
  well as promotes**: a priority-0 defender demand for the crippled room becomes
  95 at the donor, sitting behind every one of the donor's own income tiers. Aid
  is help, not a hostile takeover of someone else's spawn queue.
- No Stable donor → no-op; every room's own minBody bootstrap remains the floor.
- Cost model, stated: a filter over ~5–20 in-flight demands per tick — trivial, but
  it makes §9's "empire+expansion ≤ 1 (throttled, amortized)" line inaccurate as
  written; the §9 table gains a footnote at M6 (the budget is unchanged, the
  "throttled" description now has one every-tick member).

## Safe-mode arbitration (moves defense's M4 stub here)

Engine facts (review-verified): the exclusivity is **per-user** (`ERR_BUSY` if any of
MY controllers is in safe mode), enforced in the runtime — and two `activateSafeMode`
calls in one tick **silently cancel each other** (the engine keeps only the last
intent). So the arbiter must serialize within the tick, not just across ticks:

- `requestSafeMode(room)` grants iff: no controller in the snapshot is in safe mode,
  `Game.time − lastSafeModeGrant > grantCooldown`, AND no grant has been issued
  **this tick** (an in-heap tick guard — the same-tick double-fire loses the room
  you meant to save).
- Defense keeps its per-controller checks (available/cooldown/upgradeBlocked — it
  already has them) and calls the arbiter before activating; **`lastSafeModeGrant`
  is stamped only on `OK`** (stamping on grant burns the policy cooldown on an
  engine refusal).

## Memory schema

```ts
interface EmpireMemory {
    v: 1;
    rooms: Record<string, { state: RoomLifecycle; since: number }>;
    lastSafeModeGrant?: number;
}
```

Lost rooms are pruned at refresh — **without** an empire-side RoomLost alert (review:
the shell's continuity check already fires it a tick earlier and telemetry dedupes by
kind; a second alert is swallowed noise).

## Tick flow

- `Empire` — class C, interval 20, phase 17: classify (ordered rules above), prune,
  compute `expansionWanted` = `Game.gcl.level > ownedRooms` (exactly the engine's
  claim gate — verified equivalent) AND `lastWindowAvgCpu() ≤ 0.8 × limit` (no full
  window yet — first 100 ticks after reset — → false; conservative cold start) AND
  every owned room Stable.
- `EmpireAid` — class B, every tick, before Spawn in entry order.

## Edge cases

- **One room owned**: registry of one; aid no-ops; arbitration degenerates to M4.
- **All rooms crippled**: no donor → no-op; minBody bootstrap is the floor.
- **Two raids, one tick**: the tick guard serializes; first request wins; triage,
  not fairness — stated.
- **GCL below owned count**: trigger false; nothing thrashes.
- **Global reset**: registry rebuilt in a pass; `since` hysteresis is cosmetic.

## Test plan

Unit: the ordered classify matrix (fresh claim vs wiped room vs turnover-gap room —
each rule's edge); rebuild-skeleton emission for spawnless rooms (the economy delta);
brokerAid rewrites home only, nearest-Stable, floor 95, no-donor no-op; safe-mode
serialization (same-tick second request denied; cooldown from OK only);
expansionWanted conjunction incl. cold-start; prune without alert.

Sim: `expand` (expansion.md) exercises registry + trigger; the rebuild-aid path gets
a `crippled` scenario at M7 (a wiped sibling next to a donor — the natural extension;
noted, not promised).
