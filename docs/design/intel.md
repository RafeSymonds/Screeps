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
   runs first, then rotation. Targets = exit-adjacent neighbors of owned rooms
   (`describeExits`, null-safe) of type Normal/Center with no intel or `lastSeen`
   older than `restaleTicks` (5000). One scout per home: demand `[MOVE]` (50 energy)
   at **priority 40** — after income (≤ 31), before builders (50): a 50-energy scout
   unlocks whole remote rooms and must not queue behind a 1200-energy upgrader
   (review-caught: at 150 it structurally never spawned — the resolver's
   head-of-line break parks everything behind an unaffordable big body).
   Intel owns its scouts (`owner: Intel`) and retargets by owner-rewrite.
3. Scouts avoid `SourceKeeper` rooms as targets; routing keeps M5 simple (adjacent
   rooms only — no multi-room chains yet).

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

Sim: `remote-mining` — W2N1 intel exists before adoption; `remote-invader` — the
hostiles line is recorded while they camp, `unsafeUntil`/hostile-recency suppresses
adoption, mining starts only after they expire.
