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
    /** approxTravelTiles = Game.map.getRoomLinearDistance(home, remote) × 50 + 25 —
     *  a named adapter helper with a stated unit (tiles), NOT the roomName-blind
     *  chebyshev helper, which returns garbage across rooms. */
    candidates: { roomName: string; intel: RoomIntel; travelTiles: number }[];
    slice: RemotesMemory;
    /** Filter: memory.owner === SubsystemId.Remotes — NOT "assignment.room is a
     *  remote", which would claim intel's scouts (§6 one-writer). */
    roster: CreepView[];
    config: RemotesConfig;   // { maxRemotesPerHome: 1, unsafeMemory: 300, ... }
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

**Why a scouted neighbour still isn't adopted** — the gates, in one place, because
"we aren't using remotes at all" is almost always one of these rather than a bug:
the room is a **highway** (x or y ≡ 0 mod 10 — two of a typical room's four
neighbours are), it has **no sources** (every seeded sim neighbour is an empty
terrain room, so single-room scenarios can never adopt), the home's capacity is
below `minHomeCap` (550 — an RCL1 room never qualifies), it is owned/reserved by
someone else, it is unsafe, or **expansion is claiming it** (below).

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
   `maxRemotesPerHome: 1` — §9 budgets ≤ 1.5 CPU for ALL of a home's remotes and one
   reserved 2-source remote already costs ~1.3 (≈ 6.5 intents); a second remote
   awaits the M6 CPU-allowance input (declared seam on RemotePlanInput, honest cap
   until then).
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

- **Remote miner**: `WORK = reserved ? 5 : 3` (unreserved sources yield 5 e/t — 3
  WORK saturates; the home's WORK_TO_SATURATE=5 is the reserved/owned number),
  1 CARRY, MOVE for full speed on plains (`ceil((WORK+1)/2)`). Unreserved:
  [W3,C1,M2] = 450; reserved: [W5,C1,M3] = 750.
- **Remote hauler**: [C,M] pairs from the round-trip formula at `travelTiles`
  (existing throughput math, correct unit in).
- **Reserver**: per the reserve decision above; `CREEP_CLAIM_LIFE_TIME = 600`
  (engine), continuously replaced via the normal gap diff.

**Priorities — re-tiered ahead of upgraders** (review-caught starvation: the resolver
breaks on the first unaffordable demand, and home upgraders (priority 100, ~1200
energy, no minBody) re-emit forever, so anything numbered above 100 never spawns):
remote miners/haulers at **60 + slot** (after home income ≤ 31, after scout 40 and
builders 50, BEFORE upgraders 100 — marginal remote income beats marginal home
upgrading), reserver at **90**. Remote bodies are small (450–750), so head-of-line
stalls are short by construction.

**Caps, honestly**: remote creeps are outside `maxCreepsPerRoom` (home residual math
is untouched); the remote's own workforce is bounded by its formulas (~6 creeps for a
reserved 2-source remote) and by `maxRemotesPerHome`. Stated, not hidden.

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

Unit: adoption gate (type/owner/foreign-reservation/unsafe/profit); profit model
includes pile decay; reserve decision at homeCap 550/650/1300 × 1/2-source; body
formulas (sizes and full-speed MOVE counts); priorities (60-tier below builders,
above upgraders; reserver 90); unsafe suppression from intel recency; roster filter
by owner; drop on disqualification; travel-tiles unit (linear×50+25).

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
