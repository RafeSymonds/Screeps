# Room Economy Design

Status: draft — M2 scope (pre-layout: no containers, no construction, no links), revised
after fresh-context review (the first draft's formulas didn't close RCL1→3 on the actual
gate map — this version's numbers are checked against `sim/scenarios/default.js`).
Parent: [architecture.md](architecture.md) §5.5 (also §3 principles 2 and 8, §4 "no marketplace").

## Goal

Per owned room, turn energy into controller progress with a workforce that is fully
legible from Memory: every creep has one explicit assignment written at spawn, chosen by
a pure planner — no job board, no scoring auctions. Success criteria:

- The M2 sim gate (specced at the bottom): `default` reaches RCL3 unattended in ≤ 4500
  ticks.
- "Why is this creep doing that?" is answered by `creep.memory.assignment` alone.
- The planner is a pure function with unit tests for every workforce rule below.

M2 deliberately runs the **pre-container economy**: miners drop-mine onto the ground,
haulers ferry to spawn and to an upgrade pile, upgraders consume the pile. Containers,
builders, and repair arrive with layout/construction (M3) as new assignment kinds — the
contracts here don't change.

## Interface

```ts
// src/shared/assignments.ts — cross-subsystem: economy writes, creeps executes
export enum AssignmentKind { Mine = "mine", Haul = "haul", Upgrade = "upgrade" }
export interface MineAssignment { kind: AssignmentKind.Mine; room: string; sourceId: Id<Source> }
export interface HaulAssignment { kind: AssignmentKind.Haul; room: string; sourceId: Id<Source> }
export interface UpgradeAssignment { kind: AssignmentKind.Upgrade; room: string }
export type Assignment = MineAssignment | HaulAssignment | UpgradeAssignment;

// CreepMemory (ambient, declared in main.ts, all optional — creeps may predate M2):
//   { home?: string; owner?: SubsystemId; assignment?: Assignment }
// Stamped at spawn from the demand; thereafter only the owner rewrites *assignment*
// (home never changes; owner changes only by explicit handoff — architecture §6).

// src/economy/planner.ts — the pure core
export interface RoomPlanInput {
    room: RoomSnapshot;
    roster: CreepView[];              // my creeps with memory.home === room.name (incl. spawning)
    sourceSpots: Record<string, number>; // walkable tiles adjacent to each source
    upgradeSpot: Pos;
    config: EconomyConfig;
}
export function planRoom(input: RoomPlanInput): SpawnDemand[];  // priority-ordered gaps

// src/economy/config.ts — every tunable, one place, all provisional:
export const ECONOMY_CONFIG = {
    maxCreepsPerRoom: 20,   // M2 CPU allowance (principle 8): ~20 intents ≈ 4–6 CPU is fine
                            // while the whole 20-CPU budget serves ONE room. This number
                            // deliberately exceeds the §9 multi-room per-room budget and
                            // MUST tighten when M6 makes rooms share the pie.
    maxUpgraders: 8,
    minPickup: 20,          // haulers don't chase crumbs (creeps.md)
    prespawnLead: 50,       // covers spawn-to-seat travel (~15 tiles at 2 t/tile) + margin
    downgradeFloor: 4000,
    plainsFactor: 1.1,      // path-length proxy multiplier over chebyshev
    tripOverhead: 8         // pickup + deliver intents + queueing slack per round trip
};

// src/economy/index.ts — the class-B perRoom entry: ensures the econ slice (computing
// spots on first need from terrain), builds RoomPlanInput from ctx.snapshot, calls
// planRoom, pushes demands into ctx.spawnDemands. Also the slice's accessor:
export function getUpgradeSpot(roomName: string): Pos | undefined;  // consumed by creeps' adapter (§6 accessor rule)
```

## Workforce model (the whole policy, in one place)

Income truth: a source holds 3000 energy per 300-tick regen = **10 e/t**; one WORK
harvests 2 e/t. Ground piles decay **`ceil(amount/1000)` per pile per tick** — a 1 e/t
floor per standing pile (≈3 e/t standing tax across two source piles + the upgrade
pile), which is the accepted cost of the pre-container economy. Bodies are sized to
`energyCapacityAvailable`; at M2 capacity is pinned at 300 (no extensions until M3), so
saturating a source takes multiple small miners, bounded by its walkable adjacent tiles.

Slots are allocated top-down from `maxCreepsPerRoom`, and **upgraders are the residual**
— income staffing is computed, and every slot not needed to produce or move energy
upgrades the controller. That is the whole sizing policy:

1. **Miners** — `{Mine, sourceId}`, sit adjacent, drop-mine. Body: maximize WORK with
   1 MOVE per 5 WORK (min `[W,W,M]` = 250; more WORK per body always preferred as
   capacity grows — fewer creeps, fewer intents; no artificial WORK cap). Per source:
   miners until summed WORK ≥ 5 or adjacent walkable tiles run out. (At 300 cap:
   3 × `[W,W,M]` per source.)
2. **Haulers** — `{Haul, sourceId}`, pickup end pinned to one source, **counted
   globally**: `haulers = clamp(ceil(totalSourceRate × roundTrip / carryPerHauler),
   1, remaining slots)`, then assigned round-robin across sources (closest-to-spawn
   source first, ties by id). `roundTrip = 2 × dist × plainsFactor + tripOverhead`
   where `dist = chebyshev(source, upgradeSpot)` — the upgrade pile is the dominant
   sink at steady state; spawn deliveries are shorter, so this is conservative.
   Body: `[C,M]` pairs, `max(2, floor(cap/100))` pairs, bounded only by the game's
   50-part limit (25 pairs). Bigger bodies shrink the count automatically through the
   throughput formula — fewer, larger creeps as capacity grows.
   Delivery policy (executed in creeps.md): spawn + extensions with free capacity
   first → otherwise drop the load at the upgrade spot (within range 1).
3. **Upgraders** — `{Upgrade}`, count = `clamp(maxCreepsPerRoom − miners − haulers,
   1, maxUpgraders)`. **The floor of 1 is absolute**: if the residual is zero, the
   last hauler slot is forfeited instead — a room that moves energy but never spends
   it is pointless, and this single rule is the whole arbitration between the CPU cap
   and the downgrade guard (no separate trim pass, nothing to conflict). Body:
   `[W,W,C,M]` units (300 energy, 2 WORK each — at 300 cap exactly one unit fits with
   no stranded energy; the naive `[W,C,M]` formula wastes 100 of 300, halving
   throughput for free), `max(1, floor(cap/300))` units bounded only by the 50-part
   limit (12 units). Upgraders live at the upgrade pile; they never walk to sources.

   **No artificial body caps anywhere** (applies to every role): bodies scale with
   `energyCapacityAvailable` up to the game's 50-part limit and nothing else — a
   later-game room fields fewer, bigger creeps, which is both more energy-efficient
   and cheaper in intents (principle 8). Caps on *counts* fall out of the throughput
   formulas as bodies grow.
4. **Downgrade guard**: `controller.ticksToDowngrade < downgradeFloor` is already
   covered by the absolute floor of 1 upgrader; the guard exists as a named test case,
   not a separate mechanism.

Checked against the gate map (spawn (25,25), sources (10,40)/(40,40), controller
(25,18), all plains) — **and corrected against measured sim behavior**: the decay floor
is per *standing pile*, and drop-mining keeps one pile alive per miner plus the upgrade
pile — at full staffing ≈ 7 piles ≈ **7 e/t of decay, the dominant pre-container tax**
(the first draft estimated 3). Measured budget at steady state: ~16 e/t realized mining
= ~6 e/t controller + ~4 e/t spawn overhead + ~6 e/t decay. **The pre-container economy
delivers ~6 e/t of controller progress during the first generation and settles to ~4 e/t
steady state once 1500-tick replacement overhead kicks in (measured over t1500–2500);
that is a ceiling of the era, not a bug.** Extensions (M3 construction) raise capacity to 550+, collapse
mining to one big miner per source (2 piles), and unlock the ~12 e/t economy — so
RCL3-speed is M3's gate; M2's gate asserts the sustained pre-container rate.

**Priority order** (lower number = more urgent): first miner on the closest source
(priority 1), first hauler (2), then miners and haulers **pairwise interleaved** —
miner_k at 3+2k, hauler_k at 4+2k — so haul capacity grows in step with mining capacity
(a strict all-miners-first tier left mined energy rotting on the ground while the spawn
starved on one minBody ferry; sim caught it). Upgraders come last (priority 100), after
income is staffed — income compounds, upgrading doesn't.

**Bootstrap is per-role, carried by the demand itself** (no side-channel): when the
roster has **zero miners**, miner demands carry `minBody: [W,M]` (150); when **zero
haulers**, hauler demands carry `minBody: [C,M]` (100). The spawn resolver (spawn.md)
uses `minBody` when the ideal is unaffordable — so a fresh room spawns a working miner
at t≈0 and a working ferry ~100 ticks of trickle later, not 500; a wiped room with a
drained spawn recovers the same way. `minBody` presence *is* the emergency signal.

**Assignments are for life.** Stamped at spawn from the demand's seed, never reassigned
at M2 — replacement happens through the spawn pipeline. The planner's per-tick job is
only: desired-vs-roster diff → demands for gaps.

**Pre-spawn replacement**: a creep with `ticksToLive < 3 × bodyParts + prespawnLead`
stops counting toward its slot, so the replacement demand appears while it still works
(3-part body → threshold 59) and throughput never gaps across generations.

## Memory Schema

Owner of `Memory.rooms[name].econ` (architecture §6's economy slice — the ownership
table names it `econ`; the workforce plan itself is **derived every tick and never
persisted**, per "derived data stays derived" — what persists is only what's expensive
or arbitrary to recompute):

```ts
interface EconMemory {
    v: 1;
    /** Walkable tile within range 3 of the controller: prefers ≥3 walkable neighbors
     *  (so several upgraders fit around the pile), then minimal distance to spawn. */
    upgradeSpot: { x: number; y: number };
    /** Walkable tiles adjacent to each source, from terrain. */
    sourceSpots: Record<string, number>;
}
```

Recomputed from scratch if missing or version-mismatched (pure functions of terrain +
controller/spawn positions). Ambient `RoomMemory { econ?: EconMemory }` joins main.ts.

## Tick Flow

Class B, perRoom, every tick (a cheap pure diff). When shed under CPU pressure: no
demands that tick — spawning pauses, standing assignments keep executing, nothing
breaks. The accessor `getUpgradeSpot` reads persisted state, so creeps (class A) works
even on economy-shed ticks; before economy's first-ever run it returns `undefined` and
executors degrade (creeps.md).

## Edge Cases

- **Zero creeps** (fresh, wiped): per-role minBody path; economy restarts from any
  energy level ≥ 100 + trickle.
- **Spawning creeps count as roster** — no double-demands while a replacement is in the
  tube.
- **No sources**: no demands; the room idles rather than thrashes.
- **Upgrade spot occupied/unreachable**: it's a preference — haulers drop within range
  1, upgraders work within range 3 of the controller; a blocked tile degrades via
  movement, never stalls (the range-0 "stand exactly on it" rule was reviewed out as a
  livelock).
- **Seat contention**: multiple miners per source share tiles without explicit seats at
  M2 (movement's stuck handling shuffles them); idle haulers must not squat the seat
  ring — executor rule in creeps.md. Explicit seats arrive with containers (M3).
- **NPC invaders (declared exposure)**: invasions trigger around ~100k energy harvested
  per room; at saturation that's ~t5000 — *after* the ≤4500-tick gate by design, but
  the threshold is randomized, so an early wave can wipe an undefended M2 workforce.
  Accepted until defense (M4); the gate documents this as the known flake source.
- **Global reset / lost slice**: `econ` recomputes; assignments live in creep memory;
  the diff is stateless.

## Test Plan

Unit (pure planner + spots/bodies helpers, no Screeps globals):

- Bodies: miner/hauler/upgrader formulas at 300, 550, and 2000 capacity — proving
  unbounded scaling (bigger capacity → bigger bodies) with only the 50-part game limit
  as ceiling; `[W,W,M]` miner floor; `[W,W,C,M]` upgrader at 300.
- Saturation: 2 sources × ≥3 spots at 300 cap → 3 miners per source, stop at WORK ≥ 5;
  2 spots → 2 miners.
- Residual sizing: on the gate-map geometry, the demanded steady-state roster is
  6 miners + 7 haulers + 7 upgraders; upgraders never 0 (hauler forfeits when the
  residual would be 0).
- Priorities: empty room → minBody miner (closest source) then minBody hauler then
  second source's miner; staffed room emits only upgrader top-ups.
- Bootstrap flags: minBody present on miner demands iff zero miners; on hauler demands
  iff zero haulers.
- Pre-spawn: 3-part miner at ttl 55 → replacement demanded; at ttl 70 → not.
- Downgrade guard: low ticksToDowngrade still yields ≥1 upgrader with a full room cap.
- Upgrade-spot chooser: picks a range-3 tile with ≥3 walkable neighbors nearest spawn
  on a mocked terrain grid.

### The M2 sim gate (this is the milestone's definition of done)

`sim/tests/m2-economy.test.js`, `default` scenario, 2500 ticks (~10 min wall clock,
background it), asserting on the timeline and final memory:

- zero engine/bot errors and `stats.counters.errors === 0`;
- RCL ≥ 2 by tick 1200 (measured: ~t850);
- sustained upgrade throughput: controller progress gained between t1500 and t2500 is
  ≥ 3500 (≥ 3.5 e/t — margin below the measured ~4.26 e/t steady state), or RCL3 was
  reached;
- controller progress non-decreasing across snapshots (within an RCL);
- creep count ≥ 15 at every snapshot after tick 900 — generational continuity across
  the first 1500-tick lifetime boundary (~t1500–1700), the spawn pipeline's real test.

RCL3 itself is asserted by M3's gate, where extensions make it reachable at speed.
