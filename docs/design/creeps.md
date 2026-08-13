# Creep Execution Design

Status: M5 scope — adds the cross-room dispatch model (travel preamble), Scout and
Reserve executors, and link tweaks, on top of M4's Defend/storage/fortification and
M3's container-aware executors + Build.
Parent: [architecture.md](architecture.md) §5.11 (also §3 principle 2 — executors never write assignments).

## Goal

The thin doing-layer: read each creep's assignment, run the small state machine for that
kind, emit game intents and movement requests. No decisions beyond micro-execution.
Success criteria:

- Every executor is a pure function returning exactly one `Action`, with unit tests per
  state; the adapter that performs Actions is a dumb switch.
- A creep with a broken assignment idles cheaply and visibly — never improvises.

## Interface

```ts
// src/creeps/actions.ts — internal to this subsystem
export enum ActionKind { Harvest, Pickup, Withdraw, Transfer, Drop, Upgrade, Build, Repair, Attack, MoveTo, Idle }  // string enum in code
export type Action =
    | { kind: ActionKind.Harvest; targetId: Id<Source> }
    | { kind: ActionKind.Pickup; targetId: Id<Resource> }
    | { kind: ActionKind.Withdraw; targetId: Id<AnyStructure>; resource: ResourceConstant }
    | { kind: ActionKind.Transfer; targetId: Id<AnyStructure>; resource: ResourceConstant }
    | { kind: ActionKind.Drop; resource: ResourceConstant }
    | { kind: ActionKind.Upgrade; targetId: Id<StructureController> }
    | { kind: ActionKind.Build; targetId: Id<ConstructionSite> }
    | { kind: ActionKind.Repair; targetId: Id<AnyStructure> }
    | { kind: ActionKind.MoveTo; pos: Pos; range: number }
    | { kind: ActionKind.Idle; reason: string };

// src/creeps/executors.ts — one pure executor per AssignmentKind.
// upgradeSpot comes from economy's accessor (getUpgradeSpot); containers are found in
// the room view by position (a container within range 1 of the source / at-or-near the
// upgrade spot) — executors never touch the layout slice directly.
export function decideMine(creep: CreepView, a: MineAssignment, room: RoomSnapshot): Action;
export function decideHaul(creep: CreepView, a: HaulAssignment, room: RoomSnapshot, upgradeSpot: Pos | undefined): Action;
export function decideUpgrade(creep: CreepView, a: UpgradeAssignment, room: RoomSnapshot, upgradeSpot: Pos | undefined): Action;
export function decideBuild(creep: CreepView, a: BuildAssignment, room: RoomSnapshot, upgradeSpot: Pos | undefined,
    fortifyTargets: FortifyTarget[]): Action;
export function decideDefend(creep: CreepView, a: DefendAssignment, room: RoomSnapshot): Action;

// src/creeps/index.ts — the class-A entry (global over ctx.snapshot.myCreeps): skip
// spawning creeps; dispatch on memory.assignment.kind → executor → perform(Action).
// perform maps to game calls via snapshot handles (resolve<T>) and routes MoveTo to
// movement.requestMove. Uses the creep's current room view; no view → Idle("no-vision").
```

One Action per creep per tick: the work intent when in range, else MoveTo — never both.
Range checks are chebyshev on view positions. All "nearest/biggest" choices are argmax
over an explicit candidate list inside one pure function — the only scoring the
architecture permits (§4).

**Cross-room dispatch (M5, load-bearing).** The dispatcher computes the creep's **work
room** — Haul: `store empty ? assignment.room : (assignment.to ?? assignment.room)`;
everything else: `assignment.room`. Standing outside it → **travel**:
`MoveTo({x:25,y:25,roomName: workRoom}, 20)`, which needs no vision (movement's
roomCallback tolerates unseen rooms). Standing in it → run the executor with the view
of the room the creep occupies — which exists by definition. This replaces the M4
"no view → Idle(no-vision)" rule, which was a deadlock for any creep whose job is to
GO somewhere unseen (vision requires a creep already there), and it keeps every
executor's chebyshev checks same-room-sound (the helper is roomName-blind). A creep
whose work room is `isUnsafe` (intel accessor) while standing in it overrides to
`MoveTo(home spawn, 5)` — the retreat rule. Border mechanics are pinned by a movement
unit test: stepping onto an exit tile teleports, so path conversion needs no
direction for the transition and stays aligned.

Shared container helpers (pure, in executors.ts): `sourceContainer(room, source)` = the
container view within range 1 of the source; `spotContainer(room, spot)` = the container
at/within range 1 of the upgrade spot. "Needs repair" = `hits <
ECONOMY_CONFIG.containerRepairFloor` (economy.md owns the number).

## The state machines (entire M3 policy)

- **Mine**: source by id from `room.sources` (gone → Idle). Seat: the source container's
  tile when one exists (built) — `MoveTo(container, 0)` until standing on it — else any
  range-1 tile (`MoveTo(source, 1)`). In seat:
  1. container needs repair and carrying energy → `Repair(container)`;
  2. container needs repair, empty-handed, container has energy → `Withdraw` (one slug
     funds many repair intents: 100 hits per WORK at 0.01 energy per hit);
  3. else `Harvest` — overflow drops into the container beneath (engine-verified; no
     transfer intents ever).
  Off-container miners (transitional 300-cap generations, no container yet) drop-mine
  exactly as M2.
- **Haul**, by store:
  - Empty → assigned source's **container with ≥ minPickup energy** first: `Withdraw`
    in range 1 / `MoveTo(container, 1)`. Else biggest dropped pile ≥ `minPickup` within
    range 2 of the source: `Pickup` / `MoveTo(pile, 1)`. Neither → **stage off the
    seats**: within range 1 of the source → step back (`MoveTo(source, 2)`); otherwise
    Idle — idle ferries must not squat mining tiles.
  - Carrying → sinks in order, nearest-first within each tier: **towers with free
    capacity, while the room has hostiles** (the wartime promotion — without it,
    raid spawning holds spawn-side capacity open forever and the tower tier below
    is unreachable exactly when it matters; defense.md rung 1) → spawn/extensions
    with free capacity → **the controller feed, when starving** → towers with free
    capacity → the controller container with free capacity (`Transfer`) → no
    container: within range 1 of `upgradeSpot` → `Drop`; else `MoveTo(upgradeSpot,
    1)`. No `upgradeSpot` yet → Idle("no-spot").

    The starving clause (sim-measured): feed level = the controller container's
    energy when built, else total dropped energy within 1 of the spot; below
    `controllerFeedFloor` (200) the hauler delivers there ahead of towers. Without
    it, big-body spawning keeps spawn/extensions draining constantly, the
    all-sinks-full fallback never fires, and the floor upgrader — the downgrade
    guard economy.md promises — froze at exactly 0 e/t for entire build eras.

    M4 storage tiers (economy.md): collection adds **storage** after piles, gated on
    spawn/extensions having free capacity; delivery adds **storage** after the
    controller container and before the drop fallback. Withdraw ⟺ spawn-side free,
    deposit ⟺ spawn-side full — mutually exclusive, no loops.
- **Upgrade**, by store:
  - Empty → controller container with energy: `Withdraw` in range 1 / `MoveTo`. Else
    biggest pile within range 4 of `upgradeSpot` (or of the controller when the spot is
    undefined): `Pickup` / `MoveTo(pile, 1)`. None → Idle (the feed refills from
    haulers; walking to sources is economy.md's explicitly rejected alternative).
  - Carrying → controller container needs repair → `Repair` (upkeep outranks progress
    only below the floor — 100k of 250k hits, ~5% of intents at equilibrium). Else
    controller in range 3 → `Upgrade`; else `MoveTo(controller, 3)`.
- **Build** (new), by store:
  - Empty → refill, **never from spawn/extensions/controller-container** (economy.md):
    nearest source container with ≥ minPickup → `Withdraw`; else **nearest** pile ≥
    minPickup anywhere in the room (ties: biggest, then id) → `Pickup`; none →
    Idle("no-energy"). Nearest, not biggest — sim-measured: the biggest piles sit at
    the sources ~20 tiles from the build sites, making each 100-energy trip cost ~55
    ticks (~1.8 e/t per builder against a 15k extension bill), while haulers keep a
    pile at the upgrade spot a few tiles away. Builders eating the upgrade pile is
    construction outranking upgrading, which is the declared priority.
  - Carrying → focus site = min over `room.myConstructionSites` by **(BUILD_PRIORITY
    index of type, remaining build energy `progressTotal − progress`, id)** — the same
    shared priority list construction sequences by (`src/shared/build.ts`), so builders
    finish the most important, closest-to-done site first and every builder
    independently converges on the same one (focus-fire without cross-creep
    coordination; argmax-raw-progress was reviewed out — it prefers a 1000-remaining
    container over a 100-remaining extension and inverts construction's priority on
    fresh ties). In range 3 → `Build`; else `MoveTo(site, 3)`.
  - Refill tiers gain **storage** at the end (source containers → nearest pile →
    storage with energy) — the reserve funds building when the floor is bare (M4).
  - Work order (M4 — this exact precedence closes the rampart-decay livelock,
    defense.md): **1.** any `fortifyTargets` entry below the emergency floor
    (3 000 hits — a fresh 1-hit rampart dies at its first decay tick unless someone
    gets there first): `Repair` in range 3 / `MoveTo(target, 3)`; **2.** the focus
    construction site (priority, remaining, id — as before); **3.** remaining
    fortify targets, lowest hits first; **4.** delegate to `decideUpgrade` — labor
    is never stranded.
- **Defend** (new, M4): nearest armed hostile (any ATTACK/RANGED_ATTACK/HEAL/WORK
  part) → `Attack` in range 1 / `MoveTo(hostile, 1)`; no armed hostiles → park near
  the first spawn (`MoveTo(spawn, 2)`, Idle("parked") once there). Defenders never
  chase into other rooms at M4 (assignment is room-pinned; hostiles outside the view
  don't exist).
- **Scout** (new, M5): the travel preamble does all the walking; in the target room →
  Idle("scouting") and linger — intel's refresher records the room and its rotation
  retargets the scout on a later pass (record-then-retarget, intel.md).
- **Reserve** (new, M5): controller from the room view → `ReserveController` in range
  1 / `MoveTo(controller, 1)`; no controller → Idle.
- **Link tweaks** (M5, economy.md Links): miner beside a link with store ≥ half →
  `Transfer(link)` before resuming harvest; upgrader refill tier gains the controller
  link ahead of the container.
- **Claim** (new, M6): controller from the room view → `ClaimController` in range 1 /
  `MoveTo(controller, 1)`. The travel preamble crosses the border first.
- **Pioneer** (new, M6): the ONE role that harvests, builds, and upgrades, because a
  freshly claimed room has no miners, no haulers, and no spawn to make them. Order:
  refill by harvesting → build (spawn site first) → upgrade. The fill loop is closed
  by **position, not memory**: adjacent to a source and not full → keep harvesting;
  away from a source with a load → go spend it. (Every other executor's "empty →
  collect, else deliver" rule would send a pioneer to the site after one tick of
  harvesting, carrying 4 energy.) Upgrading is not polish at RCL1 — the 20k
  downgrade timer runs down while pioneers build, and expiry *unclaims* the room.

Idle is always legal and free. The adapter counts idles per reason in a per-tick tally
logged at Info every 100 ticks when nonzero.

## Memory Schema

None. Executors read `CreepMemory.assignment` via the snapshot's live memory reference
and write nothing — invalid assignments surface as Idle and heal by replacement
(architecture §5.11).

## Tick Flow

Class A, global, after the per-room planners and before movement resolution (normative
order). Cost is dominated by emitted intents (~0.2 each) — the currency of economy.md's
workforce cap (principle 8). `perform` details: `resolve<T>(id)` returning null (target
died this tick) → Idle, not an error; return codes other than OK/ERR_TIRED log at Debug
and wait for next tick's fresh decision — no retries, no state.

## Edge Cases

- **No assignment / unknown kind** (orphans awaiting adoption, future kind after
  rollback): Idle("unassigned") — counted, never fatal.
- **Assigned room not visible**: Idle("no-vision") — the M5 seam for remote execution.
- **Target died mid-tick / pile taken / site completed**: null resolve → Idle → next
  tick re-decides. Two haulers may race one pile; a builder may build a just-finished
  site's ghost for one tick — accepted micro-waste (§4; reservation ledgers are v1's
  disease).
- **Container full** (haulers idle at source): miner keeps harvesting; overflow beyond
  container capacity drops to ground and becomes pile fallback — self-relieving.
- **Miner seat (container tile) occupied by another creep**: movement's stuck handling
  shuffles; the miner still harvests from range 1 meanwhile (in-range check is the
  seat's range to source, not container occupancy).
- **upgradeSpot undefined** (first ticks of a fresh room): haulers spawn-deliver,
  upgraders/builders don't exist yet — degraded but sound.
- **Fatigued creep**: MoveTo still issued; movement skips fatigued creeps without
  stuck-counting (movement.md).

## Test Plan

Unit (pure executors, mocked views):

- Mine: no container → M2 behavior (range 1 harvest, drop-mining); container built →
  moves to the exact tile, harvests on it; repair-when-low with energy; withdraw-slug
  when low and empty-handed; healthy container → harvest, no repair.
- Haul: container-with-energy preferred over piles; pile fallback when container short;
  sink order spawn → tower → controller container → drop; step-off-seat preserved.
- Upgrade: withdraws from controller container before pile-scanning; repairs the
  container below the floor while carrying; upgrade in range 3 otherwise.
- Build: refuses spawn/extension/controller-container refills; focus site follows
  (priority, remaining, id) — an extension at 100-remaining beats a container at
  1000-remaining, and a fresh-tie pair resolves by BUILD_PRIORITY not id (two
  builders, same choice); delegates to upgrade behavior with zero sites; Build in
  range 3, MoveTo(3) beyond.
- Dispatch: unassigned → Idle; spawning skipped; perform maps every ActionKind
  (incl. Withdraw/Build/Repair) to the right stubbed game call; null resolve → no
  call, no throw.

Sim: the M3 gate (construction.md) — containers fill and drain, sites complete
sequentially, upgrade throughput steps up as infrastructure lands.


## Miner seats (revised Aug 2026)

Each miner of a source is assigned its **own exact tile** by `creeps/seats.ts` (pure),
and moves to it with `range: 0`.

This replaced two successive weaker rules, both of which shipped and both of which the
field disproved:

1. *Every miner targets the container.* A container is one tile, so the losers ended up
   adjacent to the container but two tiles from the source — never in harvest range,
   pathing onto an occupied tile forever.
2. *One "seat owner" gets the container, everyone else gets `MoveTo(source, range 1)`.*
   Still broken, in two ways. A range goal does not name a tile: PathFinder chooses, and it
   chooses **identically for every miner given the same goal**, so the non-owners still
   converged — sometimes onto the container itself, since containers are walkable and
   nothing excluded that tile. And with **no container at all** (early RCL, every remote
   before its container is built) there was no owner, so *every* miner fell to the same
   range-1 goal. The differentiation only existed in the case that already mostly worked.

The rule now: `seatTiles()` enumerates the source's legal adjacent tiles (open terrain, no
blocking structure, never a room-edge tile — the engine teleports creeps off those), with
the container first since mining from it drops straight into the container. `assignSeats()`
hands them out sticky-first (a miner already on a seat keeps it, so a new spawn never
evicts a working creep), then by name for the rest. Two miners can never be issued the same
destination, so there is nothing to contend over.

`decideMine` also **re-seats a displaced miner**, which the old rule never did: it only
moved a miner that was out of harvest range, so a creep shoved off its tile mined from
wherever it landed and never returned, leaving its seat empty.
