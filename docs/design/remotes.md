# Remotes — Neighbor Rooms as Energy Farms

Status: M5 scope, revised after fresh-context review (reserver math corrected against
the engine, priorities re-tiered ahead of upgraders, remote bodies right-sized, pile
decay added to the profit model, caps and units pinned). Owns
`Memory.rooms[home].remotes`. Architecture §5.10 (whose reserver paragraph this
revision corrects — see Reserve below).

## Goal

A healthy home room adopts a profitable unowned neighbor, mines it, hauls the energy
home, and decides — separately, from engine-verified constants — whether reserving is
worth it. Threats pause a remote from intel's persistent record (not live vision) and
mining resumes when they clear.

## Interface

```ts
// src/remotes/planner.ts — pure
interface RemotePlanInput {
    home: RoomSnapshot;
    homeCap: number;
    /** From intel's reach graph: `depth` = border crossings from home,
     *  `travelTiles` = depth × 50 + 25 (tiles). NOT linear distance, which calls a
     *  diagonal neighbour 1 room away when getting there costs two crossings. */
    candidates: { roomName: string; intel: RoomIntel; depth: number; travelTiles: number }[];
    slice: RemotesMemory;
    /** Filter: memory.owner === SubsystemId.Remotes — NOT "assignment.room is a
     *  remote", which would claim intel's scouts (§6 one-writer). */
    roster: CreepView[];
    remotesAllowed: number;      // CPU allowance from budget.md — replaces the old
                                 // hardcoded maxRemotesPerHome: 1
    remoteCreepsAllowed: number; // the same share priced in creeps (see How far)
    config: RemotesConfig;       // { unsafeMemory: 300, maxDepth: 2, ... }
}
interface RemotePlan {
    adopt: string[];
    drop: string[];
    demands: SpawnDemand[];
    reserve: Record<string, boolean>;
}
function planRemotes(input: RemotePlanInput): RemotePlan;
```

Assignments reuse the shared contracts: remote miner = `{kind: Mine, room: remote,
sourceId}`; hauler = `{kind: Haul, room: remote, sourceId, to: home}` (`to` = deliver
into this room's sinks; defaults to `room`); new `AssignmentKind.Reserve` +
`ActionKind.ReserveController`; `SubsystemId.Remotes`. Execution rides intel.md's
**cross-room model**: travel to the work room on no-vision, run same-room executors on
arrival — the review-caught dispatch deadlock and dual-view hauler problem are solved
there once, not per-role. Retreat: an executor whose work room `isUnsafe` (intel) and
whose creep stands in it returns `MoveTo(home spawn, 5)`; the planner suppresses
demands for unsafe remotes.

## The two economic decisions (never assumed)

**Why a scouted room still isn't adopted** — the gates, in one place, because
"we aren't using remotes at all" is almost always one of these rather than a bug:
the room is a **highway** (x or y ≡ 0 mod 10 — two of a typical room's four
neighbours are), it is **further out than `maxDepth`**, it has **no sources**
(every seeded sim neighbour is an empty terrain room, so single-room scenarios can
never adopt), the home's capacity is below the capability floor, it is
owned/reserved by someone else, it is unsafe, or **expansion is claiming it**
(below).

1. **Adopt?** — candidate gate: not the active expansion claim target (funding
   miners, haulers and a reserver for a room we are about to own wastes all of
   them the moment the claim lands — sim-observed: adopted t279, claim started
   t267), `roomType == Normal`, no owner, no foreign reservation
   (engine-verified: harvest returns early in a room reserved by another player),
   not unsafe (intel's hostiles line: armed sighting within `unsafeMemory` (300)
   ticks, or `unsafeUntil` in the future), sources ≥ 1, home healthy (cap ≥ 550,
   home income roles staffed). Profit, per remote (e/t, engine constants):
   `sources × 5 (unreserved; 10 reserved) − minerUpkeep − haulerUpkeep(travelTiles)
   − pileDecay` where `pileDecay ≈ 1 per source per hauler-round-trip's worth of
   standing pile (ceil(amount/1000) physics — the dominant loss at cross-room trip
   lengths; the review caught its omission while aZERO container term was included).
   Remote containers are the obvious M6 refinement. Adopt best-first up to
   `remotesAllowed`, the **CPU allowance** ([budget.md](budget.md)): §9 budgets ≤ 1.5 CPU
   for ALL of a home's remotes, and that share is now divided by what a remote actually
   costs instead of being pinned at 1. A single-room empire affords ~3; the number falls
   as rooms are added, which is the behaviour the hardcoded cap could never express.
2. **Reserve?** — engine-verified correction (architecture §5.10 updated with it): a
   **1-CLAIM reserver sustains a reservation indefinitely** (intents resolve before
   controller ticks, so +1/tick effect ≥ 1/tick decay), and ANY reservation doubles
   sources to 3000. `[CLAIM, MOVE]` = **650 energy** is the functional floor; 2×CLAIM
   (1300) buys *slack* — it builds the timer +1/tick so missed ticks don't drop the
   reservation, where 1-CLAIM tolerates exactly zero. Policy: reserve iff sources ≥ 2
   and `homeCap ≥ 650`; upgrade the body to 2×CLAIM+2×MOVE when `homeCap ≥ 1300`.
   Recorded per remote; re-evaluated each class-C pass. (Reservation ceiling is
   CONTROLLER_RESERVE_MAX = 5000; a 2-CLAIM creep's practical lifetime buffer is
   ~600 — stated as that, not as an engine limit.)

## Workforce (right-sized for the remote, not the home)

Remote bodies are NOT the home formulas (review-caught: `minerBody(1300)` = 15 parts
with 3 MOVE walks 1 tile/4 ticks and burns 10% of its life in transit):

- **Remote miner**: an ordinary miner with two remote-specific inputs — a WORK
  ceiling (`reserved ? 5 : 3`; unreserved sources yield 5 e/t, which 3 WORK
  saturates) and **`travelTiles`**, which buys the MOVE.

    The MOVE half was lost when remote creeps became "ordinary" miners, and it cost
    the whole subsystem. The home ratio is 1 MOVE per 5 WORK — correct for a creep
    that walks ten tiles once and then sits for 1500. Fatigue is 2 per non-MOVE part
    per tile against 2 cleared per MOVE per tick, so [W×5,M×1] moves **one tile
    every five ticks**: 625 ticks to reach a room two borders out, 42% of its life.
    Meanwhile its haulers — 1:1 CARRY:MOVE, full speed — arrived in 125 and shuttled
    nothing. Sim-observed as `{hauler: 8, miner: 0}` with the source untouched, and
    field-reported as "8 haulers in the same remote".

    MOVE is now priced against the trip (`MINER_TRAVEL_BUDGET_TICKS`), never below
    the parked ratio and never above full speed. The energy is trivially repaid:
    ~200 extra energy of MOVE buys ~500 extra ticks of mining at 10 e/t.

- **Remote hauler**: [C,M] pairs from the round-trip formula at `travelTiles`
  (existing throughput math, correct unit in), and the COUNT **ramps with miners
  that have arrived** — not with miners the plan intends to have.

    The fleet is sized for the room's theoretical rate, and that rate is zero until
    somebody is standing on a source. Sizing off intent is what put eight haulers in
    an unmined room; it also explains "remote haulers bring back a small percentage
    of their capacity", since a fleet sized for 20 e/t splits whatever little is
    actually there. Haulers travel at full speed and miners do not, so they would
    arrive first and wait regardless — ramping with arrivals costs nothing real.

    The same observable fixes the stranded-hauler case: "is this remote dry" now
    asks whether a miner is *standing in it*, not whether one is assigned. Intent
    read exactly like production and kept haulers parked in an empty room for the
    length of a miner's walk.
- **Reserver**: per the reserve decision above; `CREEP_CLAIM_LIFE_TIME = 600`
  (engine), continuously replaced via the normal gap diff.

**Priorities — re-tiered ahead of upgraders** (review-caught starvation: the resolver
breaks on the first unaffordable demand, and home upgraders (priority 100, ~1200
energy, no minBody) re-emit forever, so anything numbered above 100 never spawns):
remote miners/haulers at **60 + slot** (after home income ≤ 31, after scout 40 and
builders 50, BEFORE upgraders 100 — marginal remote income beats marginal home
upgrading), reserver at **90**. Remote bodies are small (450–750), so head-of-line
stalls are short by construction.

**Caps, honestly**: remote creeps are outside the home's `creepsAllowed` (home residual
math is untouched); the remote's own workforce is bounded by its formulas (~6 creeps for a
reserved 2-source remote) and by `remotesAllowed`. Stated, not hidden. Note the two
allowances are computed from the same §9 split, so remote creeps are budgeted — just in
the `perRemotesShare` line rather than the room's own.

### How far (Aug 2026)

Candidates come from intel's **reach graph** out to `maxDepth` (2) border
crossings, not from `describeExits`. Depth 1 was never a policy — it was the query
that happened to be easy — and it means a home whose four neighbours are two
highways and a barren room mines nothing, however good the room one border further
is.

**Distance is priced, not merely capped.** Three mechanisms, in the order they
bite:

1. **The profit model already charges for it.** A remote's income is a property of
   the room — two sources pay 10 e/t reserved whether they are next door or three
   rooms out — but hauler carry is sized by round trip, so the fleet grows roughly
   linearly with distance. `remoteProfit` subtracts that, and ranking by profit
   therefore prefers near rooms without any rule saying so.
2. **`travelTiles` is now honest.** It was `getRoomLinearDistance × 50 + 25`, and
   linear distance is chebyshev: a *diagonal* neighbour reports 1 when reaching it
   costs two border crossings. Every diagonal candidate was sized against half its
   real round trip — under-haulered, and over-rated on profit. It is now
   `depth × 50 + 25` from the reach graph.
3. **A crew budget, because CPU is spent per creep, not per room.** The old cap
   counted *rooms* against `remotesAllowed`, which prices a 15-creep remote three
   rooms out exactly like an 8-creep one next door. `remoteCreepsAllowed`
   ([budget.md](budget.md)) is the same §9 share expressed in creeps, and
   `remoteCrewSize` (miners per source + haulers from the round trip + reserver)
   is what each candidate spends from it. So the further ones simply buy less.

    The first adoption is **exempt** from the crew cap. `remotesAllowed ≥ 1` is the
    budget table already saying a remote is affordable; letting a second, finer
    reading of the same share overrule it would produce a home that is allowed a
    remote and adopts none. The cap governs how many *more*.

**And then a hard stop at `maxDepth` anyway.** The profit model keeps clearing
`minProfit` well past where a remote is a good idea, because what actually breaks
down over distance is mostly not in it: spawn throughput (twice the haulers is
twice the spawn-ticks, every generation, from one spawn), and the extra rooms of
route where an invader ends a trip. `maxDepth: 2` is that unmodelled cost, stated
as a number rather than pretended away.

### When to adopt (revised Aug 2026)

**There is no energy-wealth gate.** A remote is simply worth doing once home mining is
staffed: more energy is strictly better, and a neighbour's sources are the cheapest source
of it. The old `minHomeCap: 550` threshold delayed remotes for no stated reason and is gone.

What remains, and why each is not a wealth policy:

1. **Home mining staffed** (`homeHealthy`: every home source has its miners, plus the
   haulers to move what they produce). Remotes extend a working economy; they do not
   substitute for one.
2. **Capability floor** (`MIN_REMOTE_CAP`, *derived* as `bodyCost(remoteMinerBody(false))`
   = 450). Below this the home cannot physically build a remote miner, so adopting would
   only emit demands the spawn can never fund and head-of-line block the queue.
3. **Count cap** — the CPU allowance ([budget.md](budget.md)), not a constant, now
   in both rooms and creeps (see How far).
4. **Profit** ≥ `minProfit`, unchanged.
5. **Depth** ≤ `maxDepth` (see How far).

**"Not ahead of internal improvements" is handled by priority, not by a gate.** Spawn
priorities are: home income 1–20, **home builders 50, remotes 60**, reserver 90, upgraders
100. Remote creeps therefore queue *behind* home construction and *ahead* of upgrading,
which is exactly the intent — a gate would have blocked remotes entirely, since a growing
room almost always has construction open.

## Memory schema

```ts
interface RemotesMemory {
    v: 1;
    rooms: Record<string, { reserved: boolean; adoptedAt: number }>;
}
```

`unsafeUntil` and hostile sightings live in intel (its slice, its accessors — remotes
only report via `flagUnsafe`).

## Tick flow

- Class C (interval 50, phase 21): adopt/drop/reserve decisions from intel.
- Class B (perRoom over homes, every tick): demand emission + retreat suppression.
  Unsafe determination reads **intel**, never the live snapshot (we only see a
  remote while standing in it — the review caught the inversion). Shed under
  pressure: no demands that tick; standing creeps keep working.

## Edge cases

- **Remote never sighted**: no candidates → no-op (designed degraded mode).
- **Remote claimed/reserved by another mid-life**: gate re-checks intel each pass →
  drop; creeps idle out (harvest fails in foreign-reserved rooms — engine rule).
  "Foreign" is a username comparison the ADAPTER makes (sim-caught: checking
  `reservedBy !== undefined` un-adopted every remote the moment our own reserver
  succeeded — intel records our reservation like anyone else's).
- **Invader core sighted**: recorded by intel; permanently unsafe until it
  disappears (defense's core-killer decision deferred — architecture §5.9 note).
- **Home crippled**: health gate fails → demands stop; adoption held in the slice.
- **Reserver gap**: reservation decays 1/tick from its built-up buffer; a 2-CLAIM
  body's ~600-tick buffer rides out spawn+travel gaps; a 1-CLAIM floor body drops
  capacity to 1500 until the replacement lands — accepted at low caps.
- **Loaded hauler when the remote goes unsafe**: it is in transit or in the home
  room — the work-room rule sends loaded haulers home regardless; nothing strands.
- **Global reset**: slice + assignments persist; class-B re-derives statelessly.

## Test plan

Unit: adoption gate (type/owner/foreign-reservation/unsafe/profit/**depth**); profit
model includes pile decay; reserve decision at homeCap 550/650/1300 × 1/2-source;
body formulas (sizes and full-speed MOVE counts); priorities (60-tier below
builders, above upgraders; reserver 90); unsafe suppression from intel recency;
roster filter by owner; drop on disqualification; travel-tiles unit
(**depth**×50+25); `remoteCrewSize` grows with depth; the crew budget prunes the
second remote but never the first.

Sim (`sim/tests/m5-remote-far.test.js`): `remote-far` — a barren neighbour and a
two-source room one border beyond it. Asserts intel records the depth-2 room, the
slice adopts it (and does **not** adopt the barren neighbour), and bot creeps work
it. This is the case depth-1 candidate selection could not do at all.

Sim (`sim/tests/m5-reach.test.js`):

- `remote-mining` (~3000 ticks, every 50): zero errors (all three checks); W2N1
  intel entry exists; adoption recorded in the slice; bot creeps working in W2N1;
  W2N1 source energy observed below its **1500 unreserved cap** (the engine clamps
  neutral sources — seeded 3000 is corrected at first regen) and at 3000 only if
  reservation landed; reservation present iff the reserve decision says so.
- `remote-invader` (~1500 ticks, every 25; scenario change: hostile `ageTime` moves
  to ~t900 so the scout can actually sight them first — the old t250 expiry made
  the pause window unobservable): hostiles recorded in intel; no remote
  miners/haulers enter W2N1 while the sighting is fresh; after expiry + unsafeMemory,
  adoption proceeds and creeps appear in W2N1.

Thresholds provisional until instrumented (M2 protocol).
