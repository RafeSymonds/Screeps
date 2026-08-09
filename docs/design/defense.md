# Defense — Threat Assessment, Towers, Response

Status: M4 scope, revised after fresh-context review (tower-refill deadlock, rampart
decay livelock, safe-mode engine rules, defender sizing, and gate vacuity — all found
and fixed below). Owns `Memory.rooms[name].defense`. Architecture §5.9.

## Goal

Every owned room notices hostiles, classifies the danger, and responds on a ladder —
towers always, defenders when towers can't, safe mode only on evidence the spawn is
dying. We know it works when `under-attack` (RCL7, 3 towers, 6 armed raiders) kills the
wave in ticks without losing a structure, and `raid-early` (RCL2, **no towers**, weak
raiders) spawns defenders that clear it — both rungs get end-to-end sim coverage; rung
3 (safe mode) is unit-covered only at M4, called out honestly. M4 runs **without
intel** (snapshot-only assessment — the §8 degraded contract).

## Interface

Pure core (`src/defense/threat.ts`, `src/defense/towers.ts`, `src/defense/response.ts`,
`src/defense/fortify.ts`):

```ts
export enum ThreatLevel { None = "none", Nuisance = "nuisance", Raid = "raid", Siege = "siege" }

interface ThreatAssessment {
    level: ThreatLevel;
    hostiles: HostileView[];      // non-ally only (diplomacy-filtered)
    armed: HostileView[];         // subset with ATTACK/RANGED_ATTACK/HEAL/WORK/CLAIM parts
    armedParts: number;           // ATTACK + RANGED_ATTACK + HEAL across them
}
function assessThreat(room: RoomSnapshot, diplomacy: DiplomacyConfig): ThreatAssessment;

/** All firing towers focus ONE target: argmax total expected damage (600 at range ≤5,
 *  chebyshev, linear falloff to 150 at ≥20), ties → lowest hits → lowest id.
 *  Excluded as targets: hostiles standing on any rampart tile (the engine redirects
 *  the shot into the rampart — engine-verified). Fires only at level ≥ Raid:
 *  Nuisance scouts are not worth 10 energy a shot or the diplomatic escalation. */
function planTowerFire(room: RoomSnapshot, assessment: ThreatAssessment):
    { towerId: Id<StructureTower>; targetId: Id<Creep> }[];

function planDefense(room: RoomSnapshot, assessment: ThreatAssessment, roster: CreepView[],
    config: DefenseConfig): { demands: SpawnDemand[]; requestSafeMode: boolean };

export interface FortifyTarget { id: Id<AnyStructure>; pos: Pos; hits: number; targetHits: number }
/** Pure: ramparts/walls below target, ascending hits, BOUNDED (top 5) — the consumer
 *  wants "the neediest", not an RCL8 room's 2500-entry scan result. */
function computeFortifyTargets(room: RoomSnapshot, rcl: number, recentThreat: boolean,
    config: DefenseConfig): FortifyTarget[];
```

Adapter (`src/defense/index.ts`) — accessors (the impure shell over the pure core):

```ts
/** Reads the slice for recentThreat, calls the pure core. Creeps' adapter calls this
 *  once per room per tick (memoized in its per-tick map) and hands the result to
 *  decideBuild; economy's adapter uses `.length > 0` for the maintenance-crew rule. */
export function fortificationTargets(roomName: string, room: RoomSnapshot): FortifyTarget[];
```

Diplomacy (§7 seam 6, retrofit-proof now): `src/shared/diplomacy.ts` —
`DIPLOMACY_CONFIG = { allies: [] as string[] }`. Default stance: everyone is hostile.

Wiring this doc adds — each named because a reviewer had to hunt for them:
`AssignmentKind.Defend` + `DefendAssignment { kind, room }` (shared/assignments),
`ActionKind.Attack` + its Action member and perform case (creeps),
`SubsystemId.DefenseTowers` + `SubsystemId.DefenseResponse` (two entries, two ids —
the scheduler requires unique ids; **telemetry RING_SIZE drops 20 → 18** to hold the
10 KB worst-case ring at 11 ids, telemetry.md updated), ambient
`RoomMemory.defense?: DefenseMemory` (main.ts), `ControllerView.safeModeCooldown?`
(views + snapshot adapter — rung 3 cannot evaluate its own preconditions without it),
and architecture §3's normative order gains the response entry explicitly.

## Threat classification (the whole policy)

From non-ally hostiles only. "Armed" = any ATTACK, RANGED_ATTACK, HEAL, WORK
(dismantle), or **CLAIM** part — a CLAIM creep attacking the controller downgrades it,
blocks upgrading, and disables safe-mode activation (engine rule), so it is never a
nuisance.

- **None**: no hostiles.
- **Nuisance**: hostiles, none armed (scouts, lost haulers). Not shot, not chased.
- **Raid**: any armed hostile, below the siege bar.
- **Siege**: `armedParts > 15 × (1 + towers in the room)` — the bar scales with our
  own tower throughput instead of raw counts (a 24-ATTACK wave is a Raid for a
  3-tower room that erases it in nine ticks, and a Siege for a towerless one).
  Provisional constant; boost detection is an M5+ refinement (snapshot carries no
  boost data — declared seam).

## The response ladder

1. **Towers (class A, every tick).** Level ≥ Raid → every tower with ≥ 10 energy
   fires at the one focus target (kill confirms beat spread). No hostiles or
   Nuisance → towers do nothing (no tower-heal/repair at M4; energy is defense
   reserve). **Refill under threat**: creeps.md's hauler sink order promotes towers
   **ahead of spawn/extensions while hostiles are present** — without this, raid
   spawning holds spawn-side free capacity open forever and haulers never reach the
   tower tier (the review's self-sustaining "towers exhausted" state).
2. **Defenders (class B).** Demanded when `level ≥ Raid` AND the room's towers
   cannot carry it: no towers, or every tower's energy < 10. Count: Raid → 1, Siege
   → `config.siegeDefenders` (3). Body: `MOVE×n then ATTACK×n` (MOVE first — parts
   die front-to-back, so the weapon dies last), `n = clamp(floor(cap/130), 1,
   config.maxDefenderPairs (10))` — the cap bounds spawn time to ≤ 60 ticks; an
   emergency response that takes 150 ticks to spawn is not one. Demands carry
   `minBody: [MOVE, ATTACK]` (130) — the emergency fallback the resolver already
   understands. **Priority 0**, ahead of all economy demands; if even the minBody is
   unaffordable, head-of-line blocking parks the queue, which is correct — nothing
   the economy could spawn matters more. Two accepted M4 limits, stated: no spawn
   preemption (a defender demand waits out an in-flight spawn — cancel-in-progress
   is a future seam), and defenders sit **outside** `maxCreepsPerRoom` (principle
   8's CPU allowance is deliberately exceeded during a raid).
3. **Safe mode (last rung) — keyed on damage evidence, not tower state**: requested
   when `level ≥ Raid` AND any spawn is below 50% hits. (The old "towers exhausted"
   precondition let a room lose its spawn with full towers to anything that
   out-tanked them.) The M4 arbiter is a stub in the adapter: attempt
   `activateSafeMode()` iff `safeModeAvailable > 0`, no active safe mode, no
   `safeModeCooldown`, no `upgradeBlocked`, and `ticksToDowngrade` healthy (the
   engine refuses ERR_TIRED on all of these — verified); the attempt tolerates and
   logs a refusal rather than modeling every engine condition. Alert via telemetry
   on request. M6 moves arbitration to empire (§5.14); the request/grant split
   already exists.

## Fortification (ongoing, not wartime)

Engine truth this section is built around: a just-built rampart has **1 hit** and
decays **300 per 100 ticks** — unattended, every new rampart dies at its first decay
tick, construction re-places it, and the loop never converges. So:

- **Builders repair emergencies before anything else** (creeps.md work order):
  any fortify target below `emergencyFloor` (3 000 hits — ten decay cycles of slack)
  outranks even the focus construction site. That is what keeps fresh ramparts alive
  through their infancy.
- **Maintenance sites don't suppress the economy** (economy.md): roads, ramparts,
  and walls are *maintenance* types — their open sites do NOT trigger the
  builders-4/upgraders-1 investment regime (which would otherwise pin upgrading at
  the floor forever, since rampart sites recur for the life of the room). Only
  producer sites (spawn/extensions/containers/tower/storage/…) do. While only
  maintenance work exists, economy fields the **1-builder maintenance crew**.
- **Targets**: `targetHits(rcl)` = 10k (≤3), 50k (4–5), 200k (6), 1M (7), 3M (8),
  tripled while `lastHostile` is within 10k ticks. **Budget share, explicitly** (§5.9
  requires it): the maintenance crew IS the budget — one builder ≈ 5 build-e/t
  ceiling, so reaching RCL8 targets (~30k energy per rampart) is a deliberate
  slow-burn measured in tens of thousands of ticks; raising the crew is a policy
  knob for a later milestone, not an emergent behavior.

`fortificationTargets` results are bounded (top 5, ascending hits) and computed via
the room snapshot — no full-room re-scans per creep (the creeps adapter memoizes per
room per tick).

## Memory schema

```ts
interface DefenseMemory { v: 1; level: ThreatLevel; lastHostile?: number }
```

Written by the **towers entry** (class A — always runs; the response entry sheds under
CPU pressure, and a raid during CPU starvation must still stamp `lastHostile` or the
fortification-scaling rule goes blind at the worst moment). Architecture §6's slice
note ("threat state, fortification targets, safe-mode requests") holds only the first;
targets and requests are derived fresh, not persisted — same reserved-slice pattern as
construction.md, called out in §6's row.

## Tick flow

- `DefenseTowers` — class A, perRoom, every tick, FIRST in entry order: assess, stamp
  the slice, fire towers. Cost when quiet: one `hostiles.length` check.
- `DefenseResponse` — class B, perRoom, immediately after: recompute the (cheap, pure)
  assessment, defender demands into `ctx.spawnDemands`, safe-mode stub. Shed under
  pressure → towers still fire.

## Edge cases

- **No towers (RCL1–2)**: rung 2 carries the room — `raid-early` proves it end to end.
- **Allies**: filtered at assessment; never targeted, never counted.
- **Hostiles on ramparts**: excluded from tower targeting (the shot would hit our own
  rampart); defenders still engage them.
- **Target dies mid-tick** (overkill): stale ids resolve null in perform; next tick
  reassesses. No coordination.
- **Safe mode refused** (cooldown/upgradeBlocked/downgraded controller): logged
  attempt, no retry loop — the conjunction re-evaluates next response tick.
- **Global reset during a raid**: slice + stateless assessment recover instantly.
- **Spawn energy trickle**: the engine only regenerates spawn energy while room
  energy is below 300 — recovery reasoning must not assume free income above that.

## Test plan

Unit (`test/unit/defense.test.ts`):

- Classification: scout-only → Nuisance; armed → Raid; the tower-scaled siege bar
  (24 armed parts: Raid with 3 towers, Siege with 0); CLAIM counts as armed; allies
  excluded; empty → None.
- Tower focus: all towers same target; falloff at ranges 5/12/20 exact; rampart-tile
  hostiles excluded; ties by hits then id; energy-dry towers don't fire; Nuisance
  never fired at.
- Defenders: none while towers have energy; towerless Raid → 1 at priority 0 with
  minBody [M,A]; Siege → 3; body formula at 300/1300/5600 caps (1/10/10 pairs),
  MOVE-before-ATTACK order.
- Safe mode: requested iff Raid+ AND spawn < 50%; stub declines on
  cooldown/active/upgradeBlocked/low-downgrade (needs `safeModeCooldown` on the
  view — part of this milestone's snapshot delta).
- Fortification: targets scale with RCL, triple under recent threat, bounded to 5,
  ascending; emergency floor classification.
- Defend executor: pursues nearest armed hostile, Attack in range 1; parks at spawn
  range 2 when quiet.

Sim (`sim/tests/m4-durability.test.js`):

- `under-attack` (~400 ticks, every 20) — rung 1: zero errors (all three checks);
  hostiles reach 0 fast (measured expectation ~10 ticks; assert by t100); tower
  energy visibly spent then stable; spawn/tower/storage counts never decrease;
  controller progress still increases. (The scenario's raiders are static and its
  controller has `safeModeAvailable: 0` — safe-mode assertions would be vacuous
  here and live in unit tests instead.)
- `raid-early` (new scenario, ~600 ticks, every 20) — rung 2: RCL2 base, no towers,
  2 armed-but-passive raiders near the base; assert a creep with ATTACK parts
  exists within ~150 ticks, hostiles reach 0, zero errors, and the economy resumes
  (progress increasing after the fight).
- `wiped-base` (~1500 ticks, every 50) — recovery: zero errors; first worker fast
  (the base starts at 1300 energyAvailable — full stores, not a trickle; the
  resolver affords ideal bodies immediately); workforce ≥ 6 by ~t1000 (planner's
  own steady state at cap 1300 is ~9 — the old ≥ 10 asserted more creeps than the
  plan ever wants); controller progress strictly positive by the end. (No
  storage-delta assertion: collect-order means the reserve mostly buffers rather
  than drains — asserting its sign was reviewed out as backwards.)

Thresholds provisional until the first instrumented run (M2 protocol).
