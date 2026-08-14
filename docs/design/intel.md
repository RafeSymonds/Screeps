# Intel — Persistent Room Knowledge + Scouting

Status: M5 scope, revised after fresh-context review (cross-room execution model,
scout priority, record-then-retarget, direct-Game surface — all fixed below).
Owns `Memory.intel`. Architecture §5.4.

## Goal

Knowledge about rooms we may not currently see — who owns them, what's in them, when we
last looked — so remotes can adopt neighbors, defense can scale to observed threat, and
expansion (M6) can score candidates. Every consumer tolerates **absence and staleness**
(the §8 degraded contract): intel is an accelerant, never a dependency. We know it works
when `remote-mining`'s neighbor is sighted by a scout and adopted hands-off.

## The cross-room execution model (M5's load-bearing change, shared with remotes.md)

The M4 dispatcher resolved `snapshot.room(assignment.room)` **before** running any
executor and idled on no-vision. That is a deadlock for every creep whose job is to GO
somewhere we can't see (review-caught: the first scout, miner, hauler, and reserver
sent to any remote would idle forever — vision requires a creep already there).

New dispatch rule (creeps/index.ts): compute the creep's **work room** — for Haul,
`store empty ? assignment.room : (assignment.to ?? assignment.room)`; for everything
else `assignment.room`. If `creep.pos.roomName !== workRoom` → **travel**:
`MoveTo({x:25, y:25, roomName: workRoom}, 20)` — no vision needed (PathFinder routes
across rooms on terrain; movement's roomCallback already tolerates unseen rooms).
Otherwise run the executor with the view of the room the creep is STANDING IN — which
exists by definition. Consequences, all deliberate:

- Executors only ever see same-room creep/target pairs, so every chebyshev range check
  stays sound (the helper is roomName-blind — a cross-border "distance 1" is garbage).
- A loaded remote hauler in the home room reads the HOME view (spawn/storage sinks
  exist there); empty in the home room, it travels back to the remote.
- Scout arrival = standing in the target room; `decideScout` then just idles
  ("scouting") and the refresher records.

## Interface

```ts
export enum RoomType { Normal = "normal", SourceKeeper = "sourceKeeper", Highway = "highway", Center = "center" }
export function roomType(roomName: string): RoomType;   // pure name arithmetic

export interface RoomIntel {
    lastSeen: number;
    sources: number[];                 // packed y*50+x
    mineral?: { type: MineralConstant; pos: number };
    owner?: string;
    reservedBy?: string;
    level?: number;
    hostiles?: { count: number; armed: number; seen: number };  // armed = armed-hostile count
    unsafeUntil?: number;
}

// src/intel/index.ts — accessors (§6)
export function getIntel(roomName: string): RoomIntel | undefined;
export function flagUnsafe(roomName: string, untilTick: number): void;
export function isUnsafe(roomName: string, now: number): boolean;
/** Every room within `maxDepth` border crossings, with its depth. See Reach. */
export function reachableRooms(origin: string, maxDepth: number): Map<string, number>;

// src/intel/reach.ts — pure
export function reach(input: ReachInput): { rooms: Map<string, number>; complete: boolean };
```

New vocabulary: `AssignmentKind.Scout` + `ScoutAssignment { kind, room }`,
`SubsystemId.Intel`. **Telemetry RING_SIZE drops 18 → 16** for the two M5 ids (this +
Remotes), telemetry.md note updated — the review caught that this arithmetic is a
build-blocker, not an afterthought.

Declared direct-`Game` surface (the snapshot exposes no visible-room enumeration, only
`myRooms` + `room(name)`): the intel refresher iterates **`Game.rooms`** directly, and
scout targeting calls **`Game.map.describeExits`** — which reads the server's map grid
and **returns null** for rooms off it (sparse in sim; null-tolerated, not assumed).
Both join snapshot.md's exception list.

## Reach — how far away a room is (Aug 2026)

`reachableRooms(origin, maxDepth)` is a breadth-first search over the exit graph,
returning every room within `maxDepth` **border crossings** and its depth. It is
the shared answer to "how far", consumed by scouting (below), remote adoption
([remotes.md](remotes.md)) and — via `roomType` — movement's route callback.

Three things it fixes, each of which was a real defect rather than a refinement:

- **Depth is not linear distance.** `Game.map.getRoomLinearDistance` is chebyshev,
  so it calls a *diagonal* neighbour one room away. There is no diagonal room
  exit: getting there means crossing two borders and walking about twice as far.
  Remotes sized hauler fleets from that number, so every diagonal candidate was
  costed at half its true round trip.
- **Source-keeper rooms are cut from the graph, not filtered from the results.**
  Their guards are permanent, respawning and lethal to anything we field, so a
  route *through* one is as fatal as a stay in one. Excluding them at traversal
  time means every consumer inherits the guarantee instead of re-deriving it.
Both the per-room exits and the finished graph are **heap-cached** — the map's
topology is fixed for the life of a shard, so an entry is correct forever and a
global reset simply re-earns it for a few `describeExits` calls. A graph is marked
*incomplete* when a room we tried to expand would not give up its exits, and an
incomplete graph is served but never cached: enshrining one would blind a home to
everything behind the gap for the life of the global.

### `describeExits` is not an existence test (sim-caught)

The first version verified each named neighbour by asking whether **it** answered
`describeExits`, on the reasoning that a sparse world may name rooms it does not
have. That check deleted the only route to the room the `remote-far` scenario
exists to mine, and would have done the same in production.

The engine builds its map grid **once per isolate**, from whatever room terrain has
been shipped to the runtime so far (`driver/lib/runtime/runtime.js`: `if(!mapGrid)
mapGrid = new WorldMapGrid(accessibleRooms, staticTerrainData)`). Terrain arrives
lazily, for rooms we have touched. So `describeExits` answers null for plenty of
real, walkable, adjacent rooms — precisely the ones we have never visited, which is
exactly the set scouting exists to visit. As an existence test it is not merely
unreliable, it is **self-sustaining**: a room never admitted is never scouted, so
never touched, so never in the grid, so never admitted.

Unreadable exits therefore mean only "cannot expand THROUGH this room" — it becomes
a leaf. "Can we actually get there?" is asked where it can be answered honestly:
by sending a scout and noticing it never arrives.

### Scout patience

A scout keeps walking to an unrecorded target rather than being redirected every
pass — that is the record-then-retarget rule, and it is right until the answer is
that the room *cannot* be reached. Then it becomes an infinite hold on the one
scout a home has, and the trap is self-sustaining in the same way: an unreached
room stays unseen, an unseen room stays top of the list, so the scout is re-sent at
the same wall for the rest of its life.

So the walk is timed. A target not reached within `scoutPatience` (400 ticks —
generous, since crossing three rooms is ~200 and a scout may be delayed by traffic
or by movement's unreachable-goal cool-off) is recorded **unreachable** and skipped.
The record is heap-only, so a global reset re-earns it: the cause may have been
transient, and re-trying costs one scout's walk. This also covers the honest
version of the case the bad existence check was reaching for — rooms that are real
but walled off — without lying about the ones that are merely unvisited.

## Memory schema

`Memory.intel = { v: 1, rooms: Record<string, RoomIntel> }` — packed positions, no
terrain. Size budget **≤ 8 KB**; entries with `lastSeen` older than 100k ticks pruned
at refresh. Missing/mismatched → reinit empty.

## Tick flow (one class-C entry, interval 25, phase 13)

1. **Refresh**: for every room in `Game.rooms` (any vision, however transient),
   overwrite its intel entry — including the hostiles line (count, armed count, seen
   tick), which is what remotes' unsafe logic reads (persistent, not live-vision —
   the review caught the causality inversion of reading the snapshot of a room we
   only see while standing in it).
2. **Scout rotation** — with the **record-then-retarget rule**: a scout at its target
   is never retargeted in the same pass that first records the room; the refresher
   runs first, then rotation. Targets = every room within **`scoutDepth` (3)** border
   crossings of an owned room (Reach, above) of type Normal/Center with no intel or
   `lastSeen` older than `restaleTicks` (5000). One scout per home: demand `[MOVE]`
   (50 energy) at **priority 40** — after income (≤ 31), before builders (50): a
   50-energy scout unlocks whole remote rooms and must not queue behind a
   1200-energy upgrader (review-caught: at 150 it structurally never spawned — the
   resolver's head-of-line break parks everything behind an unaffordable big body).
   Intel owns its scouts (`owner: Intel`) and retargets by owner-rewrite.
3. Scouts never enter `SourceKeeper` rooms — the Reach graph excludes them.

### Why depth 3, and why still one scout (Aug 2026)

M5 scouted the four rooms next door because that is what `describeExits` answers,
not because one border was the right limit. It made two decisions worse than they
had to be: remotes could only ever consider an arbitrary sample of four rooms (two
of which are typically highways), and expansion scored candidates from a map that
stopped at the fence.

`scoutDepth` (3) is deliberately **further than remotes will mine**
(`REMOTES_CONFIG.maxDepth` = 2). Knowledge is the cheap half of this trade — a
`[MOVE]` scout costs 50 energy and, carrying no other parts, generates no fatigue
on any terrain, so it walks at full speed through swamp — while the decisions it
feeds are only as good as the map they can see. Scouting exactly as far as we mine
guarantees never learning about anything better.

It stays **one scout per home** because the arithmetic says one is enough, not out
of caution: depth 3 is at most ~24 rooms, a full-speed scout crosses a room in
~50–75 ticks, so a complete sweep is well inside `restaleTicks`. A second scout
would buy freshness nothing is asking for and cost CPU every tick of its life.

**Ordering: unseen before stale, nearest unseen first, then stalest.** Ignorance
outranks staleness — an unknown room may be the next remote, while a stale one is
at worst out of date — and among unknowns the nearest is likeliest to be adoptable.
Among rooms already seen it is stalest-first, so the far ring is refreshed at all
rather than being starved by the near one.

One latent bug fell out of this. Unseen rooms were encoded as `lastSeen:
-Infinity`, which made the comparator return `NaN` whenever two of them met —
undefined sort order, harmless at four candidates and not at twenty. The fix is a
separate `seen` flag rather than a finite sentinel, because any finite sentinel
hides unseen rooms for the game's first `restaleTicks` (`now - 0 > 5000` is false
at tick 100, which is exactly when scouting matters most).

## Edge cases

- **No scout ever spawns**: consumers see absent intel; nothing breaks.
- **Scout dies en route**: demand re-emits next rotation; staleness unchanged.
- **Transient corridor vision**: interval-25 sampling may miss it — accepted; only
  the lingering target room is guaranteed a recording (the record-then-retarget rule).
- **Stale owner data**: remotes re-validate on sight; intel promises `lastSeen`
  honesty only.
- **Global reset**: slice persists; rotation is derived.

## Test plan

Unit: roomType grid; refresh writes owner/reservation/hostiles/sources from a mocked
Game.rooms; rotation stalest-first, SK-skipped, one per home, priority 40; the
record-then-retarget ordering (a scout at a just-recorded room retains its assignment
until the NEXT pass); describeExits-null tolerance; flagUnsafe/isUnsafe round-trip;
prune. Executor: decideScout travels (no vision needed) then idles in-room.

Reach (`test/unit/reach.test.ts`): depth counts border crossings, so a diagonal
neighbour is 2; SK rooms are excluded in both directions; **a named neighbour that
cannot be read is still admitted, and the graph reports itself incomplete** (the
regression above, pinned); maxDepth bounds the search. Rotation: scouting reaches
past depth 1; unseen outranks stale and nearest-unseen goes first; a target the
scout cannot reach is abandoned rather than retried forever.

Sim: `remote-mining` — W2N1 intel exists before adoption; `remote-invader` — the
hostiles line is recorded while they camp, `unsafeUntil`/hostile-recency suppresses
adoption, mining starts only after they expire.
