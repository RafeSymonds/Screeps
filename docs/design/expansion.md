# Expansion — Claiming and Bootstrapping New Rooms

Status: M6 scope, revised after fresh-context review (scheduler slot fixed — demands
were being emitted into a consumed list; GCL units corrected; anchor objective gains
a source term; timeout moved ahead of the downgrade cliff). Owns `Memory.expansion`.
Architecture §5.13.

## Goal

When empire says grow, pick the best claimable room from intel, claim it, pioneer it
until its first spawn stands, then hand it to the normal per-room stack. We know it
works when `expand` ends with W2N1 owned, its spawn pioneer-built, and its first
home-grown creep spawned.

## Interface

```ts
// src/expansion/score.ts — pure
/** Eligible: RoomType.Normal, no owner, no foreign reservation, not unsafe,
 *  sources ≥ 1, within maxRange linear rooms of a Stable room. maxRange = 1 at M6
 *  (review: intel's rotation only ever populates distance-1 rooms, so any larger
 *  range is dead spec until M7's deeper scouting — the distance term is near-inert
 *  and that is stated, not hidden). Score = sources × 40 + (novel mineral ? 10 : 0)
 *  − travelTiles ÷ 5; threshold config.scoreThreshold (20). ownedMinerals is
 *  adapter-computed from owned rooms' snapshots. */
function scoreCandidate(intel: RoomIntel, travelTiles: number, ownedMinerals: MineralConstant[]): number;

// src/expansion/plan.ts — pure state machine
export enum ClaimPhase { Claiming = "claiming", Pioneering = "pioneering" }
function planExpansion(slice, targetView | undefined, targetIntel | undefined,
    sponsor: { name: string; cap: number } | undefined, roster: CreepView[], config): ExpansionPlan;

// src/expansion/config.ts — enumerated (review: it wasn't)
export const EXPANSION_CONFIG = {
    pioneers: 3,
    maxRange: 1,
    scoreThreshold: 20,
    pioneerTimeout: 6000,     // CONTROLLER_DOWNGRADE[1] gives a fresh claim 20001
                              // ticks and level-1 expiry LOSES the room outright —
                              // 20k was a post-mortem, not a warning (review)
    claimerDeathLimit: 2,
    claimCooldown: 5000
};
```

New vocabulary: `AssignmentKind.Claim`/`Pioneer` + assignments,
`ActionKind.ClaimController`, and **two** scheduler entries (the review caught the
fatal slot bug: §3's old order ran expansion after Spawn, and `ctx.spawnDemands` is
rebuilt every tick and consumed in place — demands from a post-Spawn entry are
discarded; a class-C producer alone also has a 2% duty cycle since demands live one
tick): `SubsystemId.Expansion` (class C, interval 50, phase 33 — the decisions) +
`SubsystemId.ExpansionSpawn` (class B, every tick, **before Spawn** — demand
emission from the slice, the remotes.md split applied). Architecture §3's normative
order is updated with both. Ring arithmetic counted in empire.md (RING_SIZE 12).

## The state machine (observation-driven, so resets are free)

- **Idle**: `empire.expansionWanted()` AND no claim AND `Game.time ≥ cooldownUntil` →
  score candidates; argmax > threshold → record `{ target, sponsor, phase: Claiming,
  startedAt, claimerName?, claimerDeaths: 0 }`. Sponsor = nearest Stable room with
  **cap ≥ 650** (review: a 650 claimer demand at an RCL2 sponsor head-of-line-blocks
  its whole queue forever; the suppression is the fix).
- **Claiming**: demand one `[CLAIM, MOVE]` (650) at **priority 60** from the sponsor;
  record the resolver-assigned name on sight (roster scan). Claimer death is
  *observed*: `claimerName` set but absent from the roster while the target is still
  unclaimed → `claimerDeaths++` (the shell GCs creep memory the tick after death, so
  the name-in-slice is the only durable evidence — review). Deaths >
  claimerDeathLimit → abort + cooldown. Ownership observed (`controller.my` via
  intel/snapshot) → Pioneering. GCL note, units corrected (review): the engine
  compares **points** — claiming a 2nd room needs `user.gcl ≥ 1,000,000` (GCL_MULTIPLY
  × 1^2.4), i.e. `Game.gcl.level ≥ 2`; the sim scenario passes `gcl: 1_000_000` to
  `addBot` (the mockup already supports it — no new helper needed).
- **Pioneering**: demand `pioneers` (3) × `[W,C,C,M]×2` (500) at **priority 65**,
  `{kind: Pioneer, room: target}`. Slot fill: `owner === Expansion &&
  assignment.kind === Pioneer`, with economy's fillsSlot TTL rule reused. Executor
  precedence (all in the target room under the M5 travel rule): harvest when empty
  (the bootstrap exception — no miners exist yet); build the spawn site when one
  exists; else upgrade — which at level 1 is not optional polish: the downgrade
  timer runs down monotonically while pioneers build (each upgrade tick restores
  only 100, capped), and level-1 expiry unclaims the room. When the spawn structure
  exists → clear the claim. The room is now just an owned room; economy's minBody
  bootstrap takes over, fed by the engine's +1/tick spawn-energy regen below 300
  (the rule the final gate milestone rides on — cited, not assumed). Pioneers keep
  their assignments until death: they are NOT orphan-adoptable (`home` = sponsor is
  set — review caught the false retirement story) and nobody reassigns them; they
  pioneer-upgrade the new room until they age out. Stated cost, zero mechanism.
- **Aborts**: target ineligible / GCL regressed / claimer deaths → clear + cooldown.
  Sponsor absent-or-not-Stable at any pass (review: *lost* sponsors leave no
  registry entry at all) → re-pick; none available → hold the claim and alert once
  (a claimed room decays without pioneers — holding beats silent abandonment).
  `pioneerTimeout` exceeded → alert, keep pioneering.

## Layout dependency — the anchor objective grows a source term (M6, with this doc)

`chooseAnchor`'s no-spawn branch maximized wall clearance with centrality only as a
tie-break — on open terrain that's the room's geometric center regardless of
sources, and pioneer build time is `70 + 4d` per 200-energy cycle (review's
arithmetic: d = anchor→source distance decides whether the gate fits its budget).
Revised objective: among tiles with clearance ≥ (max clearance − 2), minimize summed
BFS distance to sources + controller; ties (y, x). Existing rooms are unaffected
(spawn-anchored); no planV bump needed — only never-planned rooms hit this branch.

## Memory schema

```ts
interface ExpansionMemory {
    v: 1;
    claim?: { target: string; sponsor: string; phase: ClaimPhase; startedAt: number;
              claimerName?: string; claimerDeaths: number };
    cooldownUntil?: number;
}
```

Respawn wipes it (shell keep-list excludes it — verified); a lost target's
`Memory.rooms` entry outliving the claim is harmless (claim re-validates on sight).

## Edge cases

- **Hostiles arrive mid-pioneering**: the target has no towers; pioneers die,
  re-demand, and the timeout alert eventually fires — defended expansion is M7,
  stated. Eligibility already excluded rooms with fresh hostile sightings.
- **Two claims at once**: impossible — one claim slot, by design.
- **Sponsor's safe mode** (scenario reality): `addBot` starts the sponsor in a 20k
  safe mode — irrelevant to claiming/pioneering, noted so nobody asserts safe-mode
  behavior on the second room in `expand`.
- **Global reset**: observation-driven phases re-derive; the demands re-emit from
  the class-B entry next tick.

## Test plan

Unit: score eligibility/ordering/threshold; ordered state transitions incl.
observed-death counting and sponsor re-pick/hold; cap-650 sponsor suppression;
pioneer executor precedence (harvest/build/upgrade) and slot-fill rule; priorities
(60/65 — the live band, below builders is wrong here because a claim IS the
strategy); anchor objective's source term (near-source anchor on open terrain).

Sim (`sim/tests/m6-empire.test.js`, new `expand` scenario: fullBase RCL5 sponsor
W1N1, neutral 2-source W2N1, `addBot(..., gcl: 1_000_000)`, **`rooms: ["W1N1",
"W2N1"]`** — the harness only watches declared rooms): zero errors; claim recorded;
W2N1 controller mine; spawn site placed (layout no-spawn anchor + construction
spawnless exception — both code paths verified live for the first time); spawn
built; W2N1's first own creep spawns. Budget **5500 ticks** (review's arithmetic:
2750–4250 build + ~400 overhead + ~8% turnover + 200 regen ticks; 4000 only fit the
near-anchor case), mocha timeout 90 min. Thresholds provisional until instrumented.
