# Construction — Sequenced Building

Status: M3 scope, revised after fresh-context review (the extension/container order was
justified by post-extension physics and has been flipped; the original gate timelines
exceeded the room's physical income and have been recalibrated; budget/carve-out rules
tightened). Owns `Memory.rooms[name].build`. Architecture §5.8.

## Goal

Turn the BasePlan (layout.md) into **a few construction sites at a time, in
economic-priority order**, so builder labor concentrates instead of smearing across
twenty half-finished roads. A half-built structure is worth nothing; one finished
extension pays back immediately. We know it works when `default` builds extensions →
source containers → controller container hands-off and the upgrade rate steps up as
infrastructure lands, and `growth` builds out a pre-existing base the same way — never
holding more than `maxOpenSites` sites.

## Interface

Pure core (`src/construction/sequencer.ts`):

```ts
interface ConstructionInput {
    rcl: number;
    plan: BasePlan;                          // layout accessor's unpacked view
    structures: { type: StructureConstant; pos: Pos }[];  // ALL existing
    mySites: ConstructionSiteView[];
    config: ConstructionConfig;              // src/construction/config.ts — { maxOpenSites: 2 }
}

interface ConstructionIntents {
    create: { pos: Pos; type: BuildableStructureConstant }[];
    removeSiteIds: Id<ConstructionSite>[];   // stale sites (off-plan) to delete
}

function sequenceBuilds(input: ConstructionInput): ConstructionIntents;
```

The priority-type list lives in `src/shared/build.ts` as `BUILD_PRIORITY` — a shared
contract, because the Build executor (creeps.md) uses the same list to rank its focus
site; construction and creeps must never disagree about what matters most.

Adapter (`src/construction/index.ts`): class-C perRoom entry — calls the core, executes
`room.createConstructionSite(x, y, type)` per create (failures logged at debug and
tolerated: a blocked tile or the global 100-site cap just means we try again next run)
and `site.remove()` per stale id. Wiring: `SubsystemId.Construction`, ambient
`RoomMemory.build`, and the ENTRIES slot after layout (layout.md Tick flow).

## Build priority

One ordered type list (`BUILD_PRIORITY`); within a type, the plan's array order:

```
spawn > extension > container > tower > storage > link > terminal > lab > factory
      > observer > powerSpawn > nuker > extractor > road > rampart > constructedWall
```

The M3-relevant order is **extensions before containers**, and the reasoning is staged
on measured physics (economy.md): pile decay is per *standing pile*, and a container
only absorbs the drops of the one miner standing on it. At 300 capacity each source
runs 3 small miners → 3 piles, so a container removes 1 pile of 3 (~1 e/t, ~5 000-tick
payback — poor). Extensions (15 000 for the RCL2 five) raise capacity to 550: miners
consolidate toward 2-per-source, hauler carry quintuples, freed creep-cap slots become
upgraders — and *then* containers eliminate most of what decay remains, at ~2–3× the
value they'd have had first. Building containers before extensions ranks them on a
benefit that only exists after the thing they'd displace. The controller container
(last in the container array) ends upgrade-pile decay and gives upgraders a withdraw
feed. Spawn leads everything because a room without one is dead (M4 wipe recovery
builds it from the plan). Roads produce nothing and come after every producer — exactly
the "20 roads vs 1 extension" failure this subsystem exists to prevent. Ramparts/walls
trail until defense (M4) drives fortification.

**Below RCL2, the only permitted create is the spawn** (`plan.places.spawn[0]`, when
the room has none — recovery trumps everything at any RCL). Not because RCL1 is long —
RCL1→2 is only **200 progress** and falls inside the workforce ramp (~t800 in `default`,
dominated by spawning, not upgrading) — but because nothing else buildable at RCL1 is
worth the energy: extensions need RCL2, and containers at 300 capacity are the poor
investment above.

## Sequencing rules (the core, in order)

1. `removeSiteIds`: any of my sites whose (type, pos) is not in the plan — plan-version
   bumps and manual leftovers get cleaned, so stale sites never eat the site budget.
   Two exceptions: never remove a spawn site when the room has no spawn (recovery in
   progress trumps plan drift), and never remove a site with ≥ 50% build progress
   (site removal refunds nothing; finishing a half-paid structure beats torching sunk
   energy — layout incorporates it on the next replan).
2. **Two budgets**, `maxOpenSites − (my open INVESTMENT sites − removals)` and
   `maxOpenMaintenanceSites − (my open MAINTENANCE sites − removals)`. **All** my
   sites count, on-plan or not (review: counting only on-plan sites let the spawn
   exception hold a third site open, violating the gate's own ≤ 2 invariant).

   **maxOpenSites = 2**: one site being finished plus one staged keeps builders
   always busy without ever spreading them. **maxOpenMaintenanceSites = 6** because
   roads want the opposite: a road is worth nothing until the whole path exists, and
   one site at a time builds it end-to-end at walking pace (field-reported as "1
   piece of road at a time to a source"). Opening the path lets the maintenance seat
   build whichever piece it is beside instead of commuting to a designated one — the
   same worker and the same total work, better ordered.

   Producers still come first: maintenance types are considered **only when the
   investment queue is idle** — nothing placed this run and nothing already in
   flight. So roads never compete with the extensions that make everything else
   affordable, and the separate budget is not a second ladder that could starve the
   first (economy.md's regenerating-work rule — roads are legal 2500-at-a-time at
   every RCL, so they must never be able to outrank anything).
3. Walk `BUILD_PRIORITY`, placements in array order. For each type: `allowed =
   CONTROLLER_STRUCTURES[type][rcl] ?? 0`, and `total` = existing structures of that
   type anywhere + open sites of that type, **incremented as creates are emitted** (a
   snapshot count would over-emit into `ERR_RCL_NOT_ENOUGH` and burn budget). Emit a
   create for each planned tile with no matching structure/site while `total <
   allowed` and budget remains. A planned tile occupied by a structure that blocks
   placement is skipped — where "blocks" means an **obstacle** structure of a
   different type; ramparts and roads stack with everything (engine-verified: both are
   exempt from the occupancy check in both directions), so a planned rampart on the
   spawn tile or a road under a creep path places fine.
4. Roads and ramparts sit in the same single ordering — they only get sites when every
   producing structure allowed at this RCL already exists, with no special case.

Incorporation (layout.md step 1) makes existing structures on-plan by definition, so
`total` and the plan agree after replans — the "misplaced room builds nothing forever"
failure mode is closed at the source.

## Memory schema

```ts
interface BuildMemory { v: 1 }   // reserved
```

**The queue is derived, not persisted** — every run recomputes intents from plan +
snapshot, so lost/stale memory can't strand a site or double-build. The slice exists
(versioned, empty) so the owner and migration path are established before anything
needs state; site-stuck detection is the first candidate, deferred until observed.
Architecture §6's row was updated to match.

## Tick flow

Class C, perRoom, **interval 10, phase 7** — deliberately co-fired with layout
(interval 50, phase 7) and ordered after it, so a fresh plan is consumed the same tick;
staggered against telemetry flush (100, phase 0). See layout.md Tick flow for the
arithmetic. Skipped under low bucket like all class C — construction pausing under CPU
pressure is by design (sites persist; builders keep building; nothing breaks).

## Edge cases

- **Global reset / lost memory**: derived queue — next run recomputes everything.
- **No plan yet** (layout hasn't run, or unplannable sentinel): no-op, try next
  interval.
- **RCL drop** (downgrade): `allowed` shrinks; over-limit *structures* deactivate by
  game rule, excess on-plan *sites* stay (they can't complete until RCL returns, and
  the ≤ 2 budget tolerates that); economy's downgrade guard makes this rare.
- **Global 100-site cap / occupied tile / race**: `createConstructionSite` fails,
  adapter logs debug, retries next interval. No persisted state to corrupt.
- **Creep standing on the tile**: sites *place* under creeps (engine checks terrain,
  structures, sites — never creeps), but obstacle-type sites won't *complete* while a
  creep stands there — transient by movement, not handled.
- **full-base scenario**: producers all exist → incorporated → zero producer creates.
  It is **not** a strict no-op: the plan's missing containers, roads, and ramparts do
  get built — that is hands-off improving an adopted base, which is the intended
  behavior, not drift. The invariant is "never duplicate a producer, never rebuild
  the existing base."
- **Blocked plan tiles linger** (wrong-type obstacle on a planned tile): skipped each
  run; the adapter logs the blocked count at debug so a stuck build-out is visible in
  telemetry rather than silent.

## Test plan

Unit (`test/unit/construction.test.ts`):

- Priority: empty room at RCL2 with a plan → creates are extensions first, ≤
  `maxOpenSites` total; containers begin only when extensions are at the RCL limit.
- Sub-RCL2: only the spawnless-spawn create; nothing else at RCL1.
- RCL gating: no tower creates at RCL2; counts respect `CONTROLLER_STRUCTURES`;
  `total` increments within a run (4 existing extensions + budget 2 at RCL2 → exactly
  1 create).
- Existing structures count toward limits (no duplicate placement); obstacle-blocked
  plan tiles are skipped; **rampart/road creates are NOT blocked by the structures
  they stack on**.
- Site budget: off-plan sites count against it; ≥ 2 open → no creates.
- Stale-site removal on plan mismatch; spawn-site exception when spawnless; ≥ 50%
  progress exception.
- Roads only after all currently-allowed producers exist.

Sim (`sim/tests/m3-building.test.js`) — **supersedes `m2-economy.test.js`** (same
scenario, now with construction; the pre-container rate ceiling no longer describes
the bot). All thresholds below are **provisional until the first instrumented run**
(M2 protocol: measure, then calibrate the gate to observed physics ± margin) — the
first draft of this doc failed review precisely for asserting timelines the room's
20 e/t physical income cannot fund. **RCL3 itself (45k progress) is out of sim reach
this era** — the gate proves the *rate step-up* that makes RCL3 inevitable, not the
level itself. Window sizing: NPC invasions **never fire in the headless sim** (the
engine requires an invader core in the sector; our worlds seed none — economy.md), so
long runs are safe; on the MMO the ~100k-harvested trigger is real exposure until M4.
Architecture §8's M3 row updated to match.

- `default`, ~7500 ticks, every 100. **Run-to-run variance on infrastructure
  milestones measured at ±800 ticks across identical-code runs** (movement
  congestion + spawn-timing noise) — thresholds carry ~2× margin over the slowest
  observed run so the gate detects regressions, not weather: zero errors — all
  three checks (`engineErrors`, `botErrors`, `stats.counters.errors === 0`); RCL2
  by t1200 (M2 regression; measured t780–1050); 5 extensions by t5000 (measured
  t3400–4300); all three containers by t7000 (measured: third lands t5800–6300+);
  total progress ≥ 13000 by t7500 — the slowest investment-locked run banks ~11000
  by t6000 at the 1-upgrader floor, so this number is reachable only if the
  upgrader throttle actually releases post-infrastructure (a windowed rate
  assertion straddled the build era and flaked); controller progress monotonic
  within an RCL; workforce ≥ 15 from t900 through t2500, ≥ 8 after (the 550-cap
  turnover troughs at 9); open sites ≤ 2 at every sampled snapshot.
- `growth`, ~3000 ticks, every 100: zero errors (all three checks); plan anchored on
  the pre-existing spawn — `memories.bot.rooms.W1N1.layout.anchor === 25*50+25`; ≥ 4
  extensions by t3000 (measured: income-first staffing delays first build to ~t1400,
  then ~1 extension per ~400 ticks at cap 300; RCL3's full 10 = 30k exceeds the
  window's income — asserted progress, not completion); exactly 1 spawn throughout
  (no duplicate producer); open sites ≤ 2 at every sampled snapshot; controller
  progress non-decreasing and net-positive. Note: the seed generalists start parked
  on core-stamp tiles, and obstacle sites can't complete under creeps — assertions
  must not depend on any specific core structure completing early.


## Build-order floors (`config.minRcl`, Aug 2026)

`CONTROLLER_STRUCTURES` says what is *legal* at an RCL; it says nothing about what is
*wise*. `minRcl` adds a per-type floor on top of it, expressing build ORDER.

Ramparts and walls are gated to **RCL4**. The engine permits them from RCL2, and taking that
permission literally spent a young room's only workers on decaying insurance while the
extensions that make everything else affordable went unbuilt. Ramparts are also a permanent
sink — they decay forever — so starting them early is not a one-off cost.
