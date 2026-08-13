# Layout — Hands-Off Base Planning

Status: M3 scope, revised after fresh-context review (links were unplanned, the search
model and tie-breaks were unstated, existing structures were an unread input — all
fixed below). Owns `Memory.rooms[name].layout`. Architecture §5.7.

## Goal

Every owned room gets a **BasePlan**: where every structure through RCL8 will stand,
computed once, persisted, and never re-litigated tick to tick. Construction
(construction.md) consumes the plan to place sites; economy consumes the controller
container position as its upgrade spot. We know it works when a fresh room and a room
with a pre-existing spawn (`growth` scenario, respawn case) both produce a valid plan
**anchored to and incorporating reality** and build out hands-off.

The plan is deliberately **unordered placement data** — sequencing is construction's
job. Placements for endgame structures (labs, links, terminal, factory, nuker, observer,
power spawn, extractor) are reserved on day one (§7 seam 3) even though nothing builds
them until their RCLs.

## Interface

Pure core (`src/layout/plan.ts`) — no `Game`/`Memory`:

```ts
interface LayoutInput {
    roomName: string;
    terrain: TerrainGrid;              // snapshot/terrain
    controller: Pos;
    sources: Pos[];
    mineral?: Pos;
    /** ALL existing structures, type + pos — anchoring + incorporation inputs. */
    structures: { type: StructureConstant; pos: Pos }[];
}

interface BasePlan {
    anchor: Pos;                       // spawn1 tile
    /** The upgrade-spot container. Explicit — NOT derivable from `places` order
     *  (review: the walled-in case would silently alias a source container). */
    controllerContainer?: Pos;
    /** Placement arrays are PRIORITY-ORDERED within each type (construction builds
     *  array-prefix order under CONTROLLER_STRUCTURES limits). Keyed by
     *  BuildableStructureConstant — the CONTROLLER_STRUCTURES key type. */
    places: Partial<Record<BuildableStructureConstant, Pos[]>>;
}

function planBase(input: LayoutInput): BasePlan | undefined;   // undefined: no anchor possible
```

Adapter (`src/layout/index.ts`) — the class-C perRoom scheduled entry plus accessors:

```ts
function runRoom(ctx: TickContext, room: RoomSnapshot): void;  // ensure/refresh the slice
/** §6-blessed accessors — consumers never read the slice directly. Unpacking
 *  injects roomName into every Pos. */
function getPlan(roomName: string): BasePlan | undefined;
function getControllerContainerPos(roomName: string): Pos | undefined;
```

Wiring this doc adds (declared where the repo declares them): `SubsystemId.Layout`
(`src/shared/subsystems.ts`), `RoomMemory.layout` ambient (`src/main.ts`), and a
scheduler entry (Tick flow below). Consumers other than construction do adjacency
matching on the room view, not on the plan — e.g. "the container next to source S" is a
snapshot lookup (creeps.md); only construction and economy's upgrade-spot sync read the
plan itself.

## Memory schema

```ts
interface LayoutMemory {
    v: 1;              // slice schema version
    planV: number;     // LAYOUT_PLAN_VERSION — algorithm version that produced the plan
    anchor: number;    // packed tile; -1 = room unplannable (negative-cache sentinel)
    ctrlContainer?: number;  // packed; absent ⟺ no valid controller-container tile
    places: Partial<Record<BuildableStructureConstant, number[]>>;  // packed, ordered
}
```

Packing is **`y * 50 + x`** — the same convention as `snapshot/terrain.ts`'s grid index
(review: two opposite conventions in one repo is a guaranteed transposition bug). A full
RCL8 plan is ~180 placements ≈ 1.3 KB JSON (size budget: **≤ 3 KB per room**). Accessors
unpack and inject `roomName`; nothing outside `src/layout/` touches packed form.
Stale/missing handling: missing slice, `v` mismatch, or `planV < LAYOUT_PLAN_VERSION` →
recompute (the plan is derived data — losing it costs one recompute, never
correctness). `anchor: -1` suppresses recomputation until a `planV` bump — an
unplannable room burns the BFS passes once, not every 50 ticks.

## The algorithm (plan.ts)

**Conventions, load-bearing** (review: each was an implementer coin-flip):

- Every search — BFS distances, Dijkstra, fallback scans — is **8-way** (chebyshev
  moves, matching creep movement). A 4-way search cannot escape the checkerboard core
  and produces an empty plan.
- BFS is FIFO with neighbors enumerated in ascending (dy, dx); **every** "nearest" /
  "minimizing" choice breaks ties by ascending (y, x). This makes the plan a total
  function of its input — stable across replans and reimplementations, not just within
  one run.
- "Valid" for a generic building tile: coords in [2, 47], not wall, not chebyshev ≤ 1
  of any source or the mineral (mining seats), not chebyshev ≤ 3 of the controller
  (upgrader ring), **not occupied by an existing structure**, not claimed by an earlier
  step. Containers, links, roads, and ramparts each state their own weaker rules below
  (e.g. a source container *must* violate the source-adjacency clause; road/rampart
  bounds are [1, 48], the engine's own limit for walkable types).

Steps, in order:

1. **Incorporation.** For each planned type, existing structures of that type (sorted
   (y, x)) become the head of that type's array, capped at the RCL8 limit. Their tiles
   are marked claimed. This is what architecture §5.7 means by *incorporate*: after a
   replan or `planV` bump, built structures are on-plan by definition — construction
   never stalls against its own past output (review: the old "misplaced = tolerated but
   counted against limits" rule froze half-built rooms forever). Demolition of
   badly-placed structures is deferred to a later milestone (needs dismantle logic);
   architecture.md §5.7 amended to match.
2. **Anchor.** The first existing spawn by (y, x). No spawn (expansion claim, or a
   wipe with no plan): clearance to the nearest wall **or room edge** is a
   **threshold, not the objective** — among tiles within 2 of the room's best
   clearance, take the one minimizing summed chebyshev distance to controller +
   sources, ties by (y, x). (M6 review: maximizing clearance lexicographically
   parks the anchor at the geometric centre regardless of where the sources are,
   and pioneer build time runs ~`70 + 4d` per 200-energy cycle in the
   anchor↔source distance — that single choice sets a permanent base's cost.
   Distance is chebyshev, not BFS: equal on open terrain, far cheaper, and the
   clearance threshold already rejects tiles walled off from the room.)
3. **Core stamp** at anchor-relative offsets, all on the anchor's checkerboard parity —
   (x+y) mod 2; same-parity tiles are never orthogonally adjacent, so every building's
   four orthogonal neighbors stay walkable and the walkable lattice (connected via
   diagonal steps) is never severed: spawn1 (0,0), storage (0,2), terminal (−2,0),
   spawn2 (2,0), factory (0,−2), spawn3 (−2,−2), nuker (2,2), observer (−2,2),
   powerSpawn (2,−2), towers at (−1,1), (1,−1), (−1,−1), (1,1), (3,1), (−3,−1).
   An offset landing on an invalid tile falls back to the nearest valid same-parity
   tile within BFS radius 5 of the intended offset; no such tile → that structure is
   omitted from the plan (logged once at recompute). Incorporated structures (step 1)
   satisfy their type's count first, so the stamp only places the remainder.
4. **Containers** — adopt-or-plan, `[source containers…, controller container]` order:
   - Per source (ordered by BFS distance from anchor): an existing container adjacent
     to the source is adopted as its seat; else the walkable adjacent tile (bounds
     [1, 48]) minimizing BFS distance to anchor. This tile is *the* miner seat.
   - Controller: an existing container within chebyshev 3 of the controller is
     adopted; else the walkable tile at chebyshev exactly 2 from the controller
     (creeps on it and all its neighbors are within upgrade range 3), ≥ 3 walkable
     neighbors, minimal BFS distance to anchor. No candidate (walled-in) → absent.
     The chosen position is recorded in `controllerContainer` explicitly.
5. **Extractor** on the mineral tile, if any.
6. **Extension field**: BFS from anchor; the first 60 valid tiles on anchor parity.
   BFS order = array order, so the first five extensions (RCL2) hug the core.
7. **Lab block** — placed *after* extensions so it doesn't displace prime RCL2–3 real
   estate outward (review: it was stealing the chebyshev-3 band for RCL6 structures).
   The one dense stamp, because the engine's real constraint is that each **output**
   lab be within range 2 of both **input** labs (not all-pairs): a fixed-orientation
   4 wide × 3 tall block, position = its top-left tile, road tiles at relative (1,1)
   and (2,1), labs on the other 10 tiles. **`places.lab[0]` and `[1]` are the inputs**
   — relative (1,0) and (2,0), from which every other lab is within range 2 (checked
   in unit tests); the rest follow in (y, x) order. Placed at the first top-left
   position, in BFS-from-anchor order, where all 12 tiles are valid/unclaimed.
8. **Links** — `[controller, farthest-source, hub, remaining sources]` order (M5,
   planV 2: RCL5 allows two links and ctrl + farthest-source is the highest-value
   pair — the original hub-first order spent slot two on a link nothing could empty):
   hub = nearest unclaimed non-wall in-bounds tile within chebyshev 1 of storage;
   controller link = same within 1 of the controller container but at chebyshev ≥ 3
   from the controller (outer ring — inner tiles are upgrader seats); per source =
   same within 1 of that source's container but not within 1 of the source (miner
   transfers at range 1 without losing a mining seat). Any parity (they sit next to
   walkable containers); each absent if no candidate. RCL8 allows 6; a 2-source room
   plans 4. Consumers derive link ROLES geometrically from the room view
   (economy.md Links), never from array order — incorporation scrambles order in
   adopted bases.
9. **Roads**: Dijkstra over cost grid — plain 2, swamp 10, wall ∞, planned/existing
   **obstacle** structures ∞ (containers, roads, ramparts are walkable and passable;
   the anchor tile is a legal search origin), planned-road 1 so later paths reuse
   earlier ones — from anchor to each source container and the controller container
   (skipped if absent), closest source first. Path tiles minus endpoints and
   structure-claimed tiles become road placements in path order.
10. **Ramparts** on the critical positions — every planned-or-incorporated spawn,
    tower, storage, and terminal tile. Ramparts stack on structures (engine-verified;
    construction.md carries the matching carve-out). Order: spawns, towers, storage,
    terminal. Defense (M4) owns rampart HP and may extend the set.

Returns `undefined` only when no anchor exists at all (no spawn and no valid tile).

## Tick flow

Class C, perRoom, **interval 50, phase 7** — co-fires with construction (interval 10,
phase 7: both due when `(time + 7) % interval === 0`, i.e. ticks ≡ 43 mod 50 hit both)
**by design**: layout runs first in entry order, so a fresh plan is visible to
construction the same tick. The stagger requirement (scheduler.md) is satisfied against
the *other* class-C entry — telemetry flush (interval 100, phase 0) never lands on a
≡ 43 mod 50 tick. Entry order: layout → construction → economy (economy syncs its
upgrade spot from the accessor) → spawn → creeps → movement.

Each run: slice valid (`v` = 1, `planV` current) **and** anchor still matches reality
(some existing spawn sits on a planned spawn tile, or the room has no spawn — wipe
case, plan persists for rebuild) → return; the common case is one compare. Otherwise
recompute `planBase` and overwrite the slice — a handful of 8-way BFS/Dijkstra passes
over 2 500 tiles, once per room per plan version.

## Plan-vs-reality reconciliation

- **Anchor mismatch** (spawn exists but on no planned spawn tile): recompute anchored
  to the real spawn. The spawn is the one structure we never argue with.
- **Existing structures**: incorporated (step 1) — on-plan by definition, tiles
  claimed, remainder planned around them. No demolition in M3.
- **Plan tile occupied by a wrong-type structure** (race between plan and reality —
  something got built there after planning): construction skips it as blocked
  (construction.md); layout does not replan around it.

## Edge cases

- **Global reset**: slice is persisted; validity check is stateless — nothing to redo.
- **Lost visibility**: layout only runs for owned rooms in the snapshot; no room, no run.
- **Wiped room (no spawn)**: plan persists; construction places the spawn1 site from it
  (M4's recovery path). Anchor check treats "no spawn" as still-valid.
- **Old persisted data** (`v`/`planV` drift): recompute — see Memory schema.
- **Walled-in controller**: `controllerContainer` absent; economy keeps its own
  fallback upgrade spot (economy.md); container array holds sources only; the road
  step skips the absent target.
- **Unplannable room** (no spawn, no valid anchor tile): `anchor: -1` sentinel, empty
  places; accessors return `undefined`; no recompute until `planV` bumps.

## Test plan

Unit (`test/unit/layout.test.ts`), on synthetic terrain grids:

- Plan validity: every placement in-bounds per its type's bounds rule, non-wall,
  deduplicated across all types; per-type counts **≤** RCL8 limits, and **==** for the
  exhaustive set {3 spawns, 60 extensions, 6 towers, 10 labs, 1 each of storage /
  terminal / factory / observer / powerSpawn / nuker, extractor iff mineral, links =
  2 + source count} on open terrain.
- Anchoring: existing spawn becomes `anchor` and heads `places.spawn`; no-spawn input
  chooses a clearance-maximal tile with the documented tie-break; recompute on anchor
  mismatch, no-op otherwise.
- Incorporation: pre-existing extensions/containers head their arrays and their tiles
  are never double-planned; a replanned room with built structures has them all
  on-plan.
- Containers: one per source, adjacent to it; controller container at range 2 with
  ≥ 3 walkable neighbors and recorded in `controllerContainer`; walled-in → absent;
  existing containers adopted, not duplicated.
- Lab geometry: all 10 labs within range 2 of both `lab[0]` and `lab[1]`.
- Links: each within 1 of its host (storage / controller container / source
  container), never on a mining seat, never within 2 of the controller.
- Checkerboard: all extensions share anchor parity; stamp fallback stays on parity.
- Determinism: same input twice → deep-equal plans (with the documented total order,
  this is meaningful, not vacuous).
- Packing round-trips with the terrain convention; accessor injects roomName.
- Unplannable input → sentinel, accessors return undefined, no re-churn.

Sim: the `growth` gate (construction.md's test plan) proves anchoring end-to-end — plan
anchored on the pre-existing spawn at (25,25), sites placed and built around it.


## Road cost: swamp is a build premium, not a movement penalty (v3, Aug 2026)

Road pathing priced swamp at **10** against plain **2** — the creep *movement* penalty. That
is the wrong model, because **a road on swamp removes the movement penalty entirely**:
creeps travel at road speed over it. The only real difference is construction cost (5×
energy, paid once) and faster decay.

At 10, the planner would detour up to five tiles to avoid a single swamp tile — which costs
*more* energy to build and then charges every creep five extra ticks per trip, forever.
Measured on a synthetic room with a swamp band between anchor and source: a 14-tile route
produced a **35-tile road** that arced 20 tiles off-course and laid **zero** tiles on swamp.

Swamp now costs **3** vs plain 2: enough to break ties toward dry ground, not enough to
buy a detour. The same route now plans **20 tiles**, crossing the swamp directly.
`LAYOUT_PLAN_VERSION` is bumped to 3 so existing rooms recompute.
