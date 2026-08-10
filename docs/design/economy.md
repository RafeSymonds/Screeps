# Room Economy Design

Status: M4 scope — adds the storage economy (haulers withdraw the reserve to fund
recovery, dump surplus instead of dropping) and the fortification-maintenance builder
crew on top of M3's container era (builders, source/controller containers, orphan
adoption). M2 (pre-container) numbers are kept below as measured history; the M2-era
default-scenario gate is superseded by M3's (construction.md).
Parent: [architecture.md](architecture.md) §5.5 (also §3 principles 2 and 8, §4 "no marketplace").

## Goal

Per owned room, turn energy into controller progress with a workforce that is fully
legible from Memory: every creep has one explicit assignment written at spawn, chosen by
a pure planner — no job board, no scoring auctions. Success criteria:

- The sim gates hold: `default` reaches RCL2 by t1200 and steps its upgrade rate up as
  infrastructure lands (construction.md — RCL3's 45k progress exceeds what a 20 e/t room
  can bank inside the invader-safe sim window, so the gate proves the rate, not the
  level); `growth` builds out with adopted labor.
- "Why is this creep doing that?" is answered by `creep.memory.assignment` alone.
- The planner is a pure function with unit tests for every workforce rule below.

Era model: **M2 ran the pre-container economy** (drop-mine to ground, ferry to spawn and
an upgrade pile) and measured its physics. **M3 adds construction**: builders as a role,
source containers as miner seats, the controller container as the upgrade spot, and
container upkeep folded into the roles that stand next to them. The contracts
(assignments, spawn demand) are unchanged in shape — Build is a new enum member.

## Interface

```ts
// src/shared/assignments.ts — cross-subsystem: economy writes, creeps executes
export enum AssignmentKind { Mine = "mine", Haul = "haul", Upgrade = "upgrade", Build = "build" }
export interface MineAssignment { kind: AssignmentKind.Mine; room: string; sourceId: Id<Source> }
export interface HaulAssignment { kind: AssignmentKind.Haul; room: string; sourceId: Id<Source> }
export interface UpgradeAssignment { kind: AssignmentKind.Upgrade; room: string }
export interface BuildAssignment { kind: AssignmentKind.Build; room: string }
export type Assignment = MineAssignment | HaulAssignment | UpgradeAssignment | BuildAssignment;
// Build carries no site id: the focus site is derived each tick from the snapshot
// (creeps.md) — a persisted id would go stale the moment a site completes.

// CreepMemory (ambient, declared in main.ts, all optional — creeps may predate M2):
//   { home?: string; owner?: SubsystemId; assignment?: Assignment }
// Stamped at spawn from the demand; thereafter only the owner rewrites *assignment*
// (home never changes after it is first set; owner changes only by explicit handoff —
// architecture §6 — or by ORPHAN ADOPTION below, the claim-with-no-releaser case).

// src/economy/planner.ts — the pure core
export interface RoomPlanInput {
    room: RoomSnapshot;
    roster: CreepView[];              // my creeps with memory.home === room.name (incl. spawning)
    orphans: CreepView[];             // my creeps in this room with NO home (seeded/recovered worlds)
    sourceSpots: Record<string, number>; // walkable tiles adjacent to each source
    upgradeSpot: Pos;
    config: EconomyConfig;
}
export interface RoomPlan {
    demands: SpawnDemand[];                            // priority-ordered unfilled gaps
    adoptions: { name: string; assignment: Assignment }[];  // orphan → slot fills (writes home/owner/assignment)
    /** Owner rewrites of its own creeps — surplus upgraders → Build while sites are
     *  open (rule 3); the adapter writes assignment only. */
    reassignments: { name: string; assignment: Assignment }[];
}
export function planRoom(input: RoomPlanInput): RoomPlan;

// src/economy/config.ts — every tunable, one place, all provisional:
export const ECONOMY_CONFIG = {
    maxCreepsPerRoom: 20,   // CPU allowance (principle 8): ~20 intents ≈ 4–6 CPU is fine
                            // while the whole 20-CPU budget serves ONE room. This number
                            // deliberately exceeds the §9 multi-room per-room budget and
                            // MUST tighten when M6 makes rooms share the pie.
    maxUpgraders: 8,        // overridden to 1 while sites are open (rule 3)
    builders: 4,            // desired while the room has open construction sites, else 0
    minPickup: 20,          // haulers/builders don't chase crumbs (creeps.md)
    prespawnLead: 50,       // covers spawn-to-seat travel (~15 tiles at 2 t/tile) + margin
    downgradeFloor: 4000,
    plainsFactor: 1.1,      // path-length proxy multiplier over chebyshev
    tripOverhead: 8,        // pickup + deliver intents + queueing slack per round trip
    containerRepairFloor: 100_000  // repair a nearby container below this many hits (max 250k)
};

// src/economy/index.ts — the class-B perRoom entry: ensures the econ slice (computing
// spots on first need from terrain, syncing upgradeSpot from layout when a plan
// exists), builds RoomPlanInput from ctx.snapshot, calls planRoom, applies adoptions
// (writes home/owner/assignment — the one non-spawn write path), pushes demands into
// ctx.spawnDemands. Also the slice's accessor:
export function getUpgradeSpot(roomName: string): Pos | undefined;  // consumed by creeps' adapter (§6 accessor rule)
```

## Workforce model (the whole policy, in one place)

Income truth: a source holds 3000 energy per 300-tick regen = **10 e/t**; one WORK
harvests 2 e/t. Ground piles decay **`ceil(amount/1000)` per pile per tick** — a 1 e/t
floor per standing pile. **Containers end that tax**: energy dropped (including harvest
overflow) on a container's tile is absorbed into it (verified in the engine's
`_create-energy`), so a miner standing on its source container fills it with zero
intents, and the upgrade pile becomes a decay-free controller container. Containers hold
2000, decay 10 hits/tick in owned rooms (250k max), and are repaired at 100 hits per
WORK per intent — upkeep is folded into the adjacent roles below, not a dedicated
repairer. Bodies are sized to `energyCapacityAvailable`.

Slots are allocated top-down from `maxCreepsPerRoom`, and **upgraders are the residual**
— income staffing is computed, and every slot not needed to produce, move, or invest
energy upgrades the controller. That is the whole sizing policy:

1. **Miners** — `{Mine, sourceId}`. Body: maximize WORK with 1 MOVE per 5 WORK **plus
   exactly one CARRY** (the repair buffer — a zero-CARRY creep cannot repair; min
   `[W,W,C,M]` = 300; no artificial WORK cap). Per source: miners until summed WORK ≥ 5
   or adjacent walkable tiles run out. Seat: the container adjacent to the source when
   one exists — found in the room view by position (creeps.md); executors never read
   the layout slice — else any adjacent tile.
   Upkeep rule (creeps.md): on the container with hits below `containerRepairFloor` →
   repair from carried energy, withdrawing a slug from the container when empty-handed.
2. **Haulers** — `{Haul, sourceId}`, pickup end pinned to one source, **counted
   globally**: `haulers = clamp(ceil(totalSourceRate × roundTrip / carryPerHauler),
   1, remaining slots)`, then assigned round-robin across sources (closest-to-spawn
   source first, ties by id). `roundTrip = 2 × dist × plainsFactor + tripOverhead`
   where `dist = chebyshev(source, upgradeSpot)` — the controller-end sink dominates at
   steady state; spawn deliveries are shorter, so this is conservative.
   Body: `[C,M]` pairs, `max(2, floor(cap/100))` pairs, bounded only by the game's
   50-part limit. Collection: assigned source's container first, ground piles as
   fallback/overflow, then **storage — but only while spawn/extensions have free
   capacity** (the reserve funds spawning and recovery, never a round trip back to
   itself). Delivery (creeps.md): spawn + extensions → controller feed when starving
   → towers → controller container → **storage** → drop at the upgrade spot only
   when nothing better exists. The two storage rules are mutually exclusive by
   construction (withdraw ⟺ spawn-side free, deposit ⟺ spawn-side full), so no
   hauler ever loops. This is also the whole wipe-recovery story (M4): a wiped room
   with a stocked storage refills its spawn from the reserve instead of waiting out
   the mining ramp.
3. **Builders** — `{Build}` (roomwide, no site id): `config.builders` (4) whenever
   the room has ≥ 1 open **investment** site; **1** (a maintenance crew) when only
   *maintenance* work exists — open sites of maintenance types, or fortification
   targets from defense.md; else 0. The type split (specced for M4's ramparts,
   landed with M3's gate calibration — road sites alone already pinned the default
   run's upgraders at the floor forever, measured at exactly 2 e/t):
   **maintenance types are road, rampart, and constructedWall** —
   their sites recur for the life of the room (ramparts decay forever), so letting
   them trigger the investment regime would pin upgraders at the floor permanently.
   Only producer sites (spawn/extension/container/tower/storage/…) engage the
   builders-4/upgraders-1 rules; rule 4's upgrader throttle keys on investment
   sites alone.
   Body: `[W,C,C,M]` units (250 energy,
   1 WORK = 5 build-e/t each), `max(1, floor(cap/250))` units, 50-part bound. Builders
   refill from source containers or ground piles — **never from spawn/extensions**
   (spawning always outranks construction) and never from the controller container
   (that's the upgraders' feed). With no open sites they behave as upgraders
   (creeps.md) — construction ending never strands labor; the planner just stops
   replacing them.

   **Construction throttles upgrading — at the energy level, not just spawn
   priority** (sim-measured: with both roles fed from the same upgrade-spot pile,
   5–7 upgraders out-ate 2 builders and extensions crawled at ~2 e/t while upgrade
   ran at ~5). While **investment** sites are open, `maxUpgraders` is overridden to
   **1** (the downgrade floor), and **surplus live upgraders are reassigned to
   Build** up to the builder target — the §6 owner-rewrite path: economy owns
   `assignment`, the `[W,W,C,M]` body is builder-capable, and conversion is instant
   and free where a spawn cycle costs 1500 ticks of the wrong workforce mix. When
   investment sites close, no reverse reassignment is needed: builders behave as
   upgraders/maintainers by executor fallback and are not replaced beyond the crew.
4. **Upgraders** — `{Upgrade}`, count = `clamp(maxCreepsPerRoom − miners − haulers −
   builders, 1, investment sites open ? 1 : maxUpgraders)`. **The floor of 1 is absolute**: if
   the residual is zero, the last hauler slot is forfeited instead — a room that
   moves energy but never spends it is pointless, and this single rule is the whole
   arbitration between the CPU cap and the downgrade guard (no separate trim pass,
   nothing to conflict). Body: `[W,W,C,M]` units (300 energy, 2 WORK each — at 300
   cap exactly one unit fits with no stranded energy), `max(1, floor(cap/300))`
   units, 50-part bound. Upgraders live at the upgrade spot; refill order:
   controller container → nearby piles. They share the container-upkeep rule with
   miners (repair when below the floor).

   **No artificial body caps anywhere** (applies to every role): bodies scale with
   `energyCapacityAvailable` up to the game's 50-part limit and nothing else — a
   later-game room fields fewer, bigger creeps, which is both more energy-efficient
   and cheaper in intents (principle 8). Caps on *counts* fall out of the throughput
   formulas as bodies grow.
5. **Downgrade guard**: `controller.ticksToDowngrade < downgradeFloor` is already
   covered by the absolute floor of 1 upgrader; the guard exists as a named test case,
   not a separate mechanism.

**Measured era physics** (sim-instrumented, gate map): pre-container steady state was
~16 e/t realized mining = ~4 e/t controller + ~4 e/t spawn overhead + ~6 e/t pile decay
(one standing pile per miner + the upgrade pile; first generation ~6 e/t controller
before 1500-tick replacement overhead). **Container value scales with miner
consolidation** — a container absorbs only the drops of the miner standing on it, so at
300 cap (3 × 2-WORK miners per source, 3 piles) it removes ~1 of ~6 decay-e/t, while at
550 cap (2 × 4-WORK miners) it removes 1 pile of 2 and at ≥ 650 (one ≥ 5-WORK miner per
source) it removes the source's decay entirely. That staging is why construction builds
**extensions before containers** (construction.md): extensions collapse the miner count
and free creep-cap slots for upgraders, then containers erase what decay remains. The
post-infrastructure target is **~10–12 e/t of controller progress** — the rate step-up
M3's gate asserts.

**Priority order** (lower number = more urgent): first miner on the closest source
(priority 1), first hauler (2), then miners and haulers **pairwise interleaved by
absolute slot** — miner slot k at 3+2k, hauler slot k at 4+2k, filled slots permanently
consuming the low priorities (gap-indexed priorities are memoryless and re-elect "next
miner" every replan; sim caught six miners and one ferry). **Builders at priority 50**
— after all income, before upgraders: construction is investment, upgrading is
consumption. Upgraders last (priority 100). Defense's defender demands sit at
**priority 0** (defense.md) and outrank everything here — an undefended raid kills the
economy anyway; the resolver needs no special case, it's just a number.

**Bootstrap is per-role, carried by the demand itself** (no side-channel): when the
roster has **zero miners**, miner demands carry `minBody: [W,C,M]` (200); when **zero
haulers**, hauler demands carry `minBody: [C,M]` (100). The spawn resolver (spawn.md)
uses `minBody` when the ideal is unaffordable — a fresh or wiped room recovers from any
energy ≥ 100 + trickle. Builders and upgraders carry no minBody: they are never
income-critical.

**Bootstrap sizing** (M4, sim-caught in `wiped-base`): while income staffing is below
floor — working miners < source count, or working haulers < min(2, source count) — **every
economy body is sized to 300**, not to `energyCapacityAvailable`. Rationale: a wiped
high-cap room's first full-cap miner (1300) drains the banked stores, after which
every remaining ideal body is unaffordable on the spawn's 300-cap self-regen (the
engine refills only the spawn, never extensions), minBody fires only for *empty*
roles, and head-of-line blocking wedges the queue for thousands of ticks — measured:
a wiped RCL4 room sat at 2–3 creeps for 1500+ ticks. At 300, the whole first
generation spawns on the proven fresh-room path; once income stands, replacements
size to full capacity through the normal pre-spawn rotation. Capacity-sized bodies
are an *earned* state, not a birthright.

**Orphan adoption** (new at M3): my creeps in the room with **no `home`** — seeded
scenario workforces (`growth`), manual spawns, recovered worlds — are claimed instead of
duplicated. The planner walks its gap list in priority order and fills each gap with the
first unused orphan whose body can do the job (Mine needs WORK, Haul needs CARRY+MOVE,
Build/Upgrade need WORK+CARRY); filled gaps emit adoptions instead of spawn demands. The
adapter writes `home`, `owner: economy`, and the assignment — the §6
"claim by successor" path with no releaser. Orphans that fit no gap stay unowned and
idle (creeps.md counts them); they are never GC'd while alive.

**Assignments are for life, with one owner-sanctioned exception.** Stamped at spawn
(or adoption) and normally never rewritten — replacement happens through the spawn
pipeline. The exception is rule 3's upgrader→builder conversion while sites are open:
the owner rewriting its own creeps, deterministically (surplus beyond the upgrader
floor, freshest first), because a spawn cycle is a 1500-tick lag on a regime change
that conversion handles instantly. The planner's per-tick job stays: desired-vs-roster
diff → adoptions, reassignments, demands.

**Pre-spawn replacement**: a creep with `ticksToLive < 3 × bodyParts + prespawnLead`
stops counting toward its slot, so the replacement demand appears while it still works
and throughput never gaps across generations.

## Memory Schema

Owner of `Memory.rooms[name].econ` (architecture §6's economy slice; the workforce plan
itself is **derived every tick and never persisted** — what persists is only what's
expensive or arbitrary to recompute):

```ts
interface EconMemory {
    v: 1;
    /** The upgrade anchor. Pre-plan: a chosen walkable tile within range 3 of the
     *  controller (≥3 walkable neighbors preferred, then nearest spawn). Once layout
     *  publishes a controller-container position, runRoom syncs this field to it —
     *  one compare per run, rewritten only on change. */
    upgradeSpot: { x: number; y: number };
    /** Walkable tiles adjacent to each source, from terrain. */
    sourceSpots: Record<string, number>;
}
```

Recomputed from scratch if missing or version-mismatched. The layout sync means the
upgrade spot, the controller container, and the haul destination are the same tile from
the first plan onward — no second source of truth.

## Tick Flow

Class B, perRoom, every tick (a cheap pure diff). When shed under CPU pressure: no
demands or adoptions that tick — spawning pauses, standing assignments keep executing,
nothing breaks. The accessor `getUpgradeSpot` reads persisted state, so creeps (class A)
works even on economy-shed ticks; before economy's first-ever run it returns `undefined`
and executors degrade (creeps.md).

## Edge Cases

- **Zero creeps** (fresh, wiped): per-role minBody path; economy restarts from any
  energy level ≥ 100 + trickle.
- **Spawning creeps count as roster** — no double-demands while a replacement is in the
  tube.
- **No sources**: no demands; the room idles rather than thrashes.
- **Upgrade spot occupied/unreachable**: it's a preference — haulers deliver within
  range 1, upgraders work within range 3 of the controller; a blocked tile degrades via
  movement, never stalls.
- **Container not yet built / destroyed**: every container-aware rule has the M2
  fallback inline (ground piles, drop at spot, terrain seats) — the pre-container
  economy is the degraded mode, permanently supported.
- **Seat contention**: small-body generations may field 2–3 miners per source; only one
  sits on the container, the rest drop-mine beside it (transitional decay accepted —
  ends when 550-capacity bodies collapse to one miner per source).
- **Sites vanish mid-life** (construction completes everything): builders fall back to
  upgrading (creeps.md); planner stops replacing them; slots return to upgraders.
- **Regime change can overshoot the cap transiently** (sim-observed): when sites
  open, surplus upgraders convert to builders (rule 3), which absorbs most of the
  shift; any live surplus beyond the builder target keeps its assignment until
  natural death. Accepted: eviction machinery for a small bounded overshoot isn't
  worth the state.
- **NPC invaders (declared exposure)**: on the MMO, invasions trigger around ~100k
  energy harvested per room — the bot is undefended until M4. **They never fire in the
  headless sim**: the engine requires an invader core in the sector (engine-verified,
  `cronjobs.js`), and our seeded worlds have none — so sim gates can run long without
  flake risk, while the MMO exposure stands until defense lands.
- **Global reset / lost slice**: `econ` recomputes; assignments live in creep memory;
  the diff is stateless.

## Test Plan

Unit (pure planner + spots/bodies helpers, no Screeps globals):

- Bodies: miner/hauler/upgrader/builder formulas at 300, 550, and 2000 capacity —
  unbounded scaling with only the 50-part limit; miner carries exactly one CARRY at
  every capacity; `[W,C,M]` miner minBody; `[W,C,C,M]` builder unit at 300.
- Saturation: 2 sources × ≥3 spots at 300 cap → 3 miners per source, stop at WORK ≥ 5;
  2 spots → 2 miners; at 550 → two 4-WORK miners per source ([W4,C,M] = 500); at 800 →
  one 6-WORK miner per source (single-miner consolidation starts at cap ≥ 650).
- Residual sizing: upgraders = cap − miners − haulers − builders, never 0 (hauler
  forfeits); builders demanded iff open sites exist.
- Priorities: builders (50) after every income slot, before upgraders (100); the
  absolute-slot interleave keeps alternating under replanning (regression).
- Orphan adoption: a [W,C,M] orphan fills the first compatible gap and suppresses that
  spawn demand; body-incompatible orphans are skipped; adopted names never double-fill.
- Bootstrap flags: minBody present on miner demands iff zero miners; hauler ditto;
  never on builder/upgrader demands.
- Pre-spawn: 3-part miner at ttl 55 → replacement demanded; at ttl 70 → not.
- Downgrade guard: low ticksToDowngrade still yields ≥1 upgrader with a full room cap.
- Upgrade-spot: chooser picks a range-3 tile with ≥3 walkable neighbors nearest spawn;
  runRoom syncs the spot to layout's controller container when a plan appears.

Sim: the M3 gate (construction.md) is the milestone's definition of done for the whole
economy+construction loop. The M2-era default gate (RCL2 by 1200, generational
continuity) survives inside it; the pre-container rate assertion does not (the same
scenario now builds infrastructure mid-run, invalidating the era's ceiling).
