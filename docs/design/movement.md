# Movement Design

Status: draft — M2 scope (cached paths + stuck recovery; traffic shoving and cost-matrix
sophistication are M4 per architecture §8), revised after fresh-context review
Parent: [architecture.md](architecture.md) §5.12 (also §3 principles 5 and 8).

## Goal

The single PathFinder call site: creeps request moves during execution, movement resolves
them in one pass at tick end with cached paths and a hard per-tick pathfinding budget.
Success criteria:

- No `moveTo`/`PathFinder` anywhere else — grep-enforceable. (Movement's own direct
  `Game` surface — `Game.creeps[name]` for live position/fatigue and the `creep.move`
  intent — is a documented exception alongside snapshot.md's list.)
- Repeat journeys reuse cached paths; a blocked creep recovers within a few ticks; and
  pathfinding CPU is bounded by an **ops pool**, not by how many creeps got confused.
- Step/cache/stuck logic is pure and unit-tested with a stubbed PathFinder.

## Interface

```ts
// src/movement/index.ts
export function requestMove(creepName: string, to: Pos, range: number): void;
/** The class-A entry, after creep execution in the normative order. */
export function resolveMoves(ctx: TickContext): void;
export function _clearForTest(): void;

// src/movement/config.ts
export const MOVEMENT_CONFIG = {
    opsPoolPerTick: 4000,       // shared PathFinder ops budget per tick (the real limiter)
    maxOpsPerSearch: 600,       // per-search cap for in-room targets (min'd with pool remainder)
    maxSearchesPerTick: 10,     // secondary guard on search count
    stuckTicks: 2,              // unmoved-and-unfatigued this many ticks → repath around blockers
    plainCost: 2, swampCost: 10 // 1 MOVE per other part baseline; road preference is M3+
};
```

Requests accumulate in a module-heap list; `resolveMoves` processes then clears them
(requests never survive a tick). One request per creep per tick — a second overwrites
the first (executors emit at most one MoveTo).

## Resolution (per request)

Live creep from `Game.creeps[name]` (gone → drop request + cache).

1. **Arrived** (`chebyshev(creep.pos, to) ≤ range`, same room — M2 targets are
   same-room; a cross-room target skips this check and trusts the path): drop cache,
   done.
2. **Fatigued**: do nothing — no step, no `idx` advance, no stuck counting (the game
   explains the non-movement).
3. **Cache** — heap `Map<creepName, CachedPath>`,
   `CachedPath = { to, range, steps: DirectionConstant[], idx, lastPos, stuckCount }`,
   valid iff same `(to, range)`:
   - `creep.pos` moved since `lastPos` → the last step happened: advance normally —
     `move(steps[idx])`, then `idx++`, `lastPos = pos`, `stuckCount = 0`.
   - `creep.pos` unmoved (and not fatigued) → **re-issue `steps[idx]` without
     advancing** and `stuckCount++`. (First-blocked-tick invalidation would make
     `stuckTicks` dead code; advancing past an unexecuted step walks a parallel wrong
     path one tile off — both reviewed out.)
   - `stuckCount ≥ stuckTicks` → drop the path, re-search with **current creep
     positions stamped into a cloned cost matrix** (clone, never mutate the shared
     per-tick matrix — stamping the cached one would poison every later search this
     tick). This walk-around is M2's whole traffic story; swap/shove is M4.
4. **No valid cache** → search, if budget allows: spend from `opsPoolPerTick`
   (`maxOps = min(maxOpsPerSearch, poolRemaining)`) and respect `maxSearchesPerTick`;
   budget exhausted → the creep stands this tick (Debug count) — walking late beats
   blowing the tick. `PathFinder.search(creep.pos, { pos: to, range },
   { maxOps, plainCost, swampCost, maxRooms: 1 for same-room targets, roomCallback })`.
   Convert to direction steps, cache, take the first step. **Incomplete paths**
   (`ret.incomplete`) are used anyway — they move toward the goal and re-search from
   closer; Debug count.

`roomCallback`: per-room-per-tick CostMatrix from the snapshot, marking blocking
structures (everything except roads, containers, and my/no ramparts — at M2 the
enumerated set is walls, spawn, extensions, controller-adjacent blockers; **hostile
ramparts block and are an explicit M4 dependency** when foreign structures appear in
scenario worlds). Rooms without snapshot views → undefined (PathFinder defaults).

## Memory Schema

None. Path caches are heap-only (architecture principle 7): a global reset costs one
repath per moving creep, drained over a few ticks by the ops pool — the post-reset
thundering herd is bounded by design.

## Tick Flow

Class A, immediately after creep execution. Cost model: cache-hit steps are one
`creep.move` intent each (0.2 CPU — part of the workforce's intent budget); searches are
the expensive part and are pool-capped. Searches/stuck/incomplete counts are Debug-level
tracers until real numbers justify window counters.

## Edge Cases

- **Creep died after requesting**: dropped at resolve time.
- **Spawning creeps**: executors skip them; no request exists.
- **Room borders**: PathFinder handles cross-room natively; `maxRooms: 1` applies only
  when target and creep share a room (prevents near-exit searches wandering into
  neighbors — PathFinder's default is 16 rooms).
- **Cache poisoning across resets**: impossible — heap dies with the reset.
- **Range semantics**: arrival uses chebyshev, matching PathFinder's `range` goal
  semantics; asserted by the arrival unit test.

## Test Plan

Unit (stubbed PathFinder global + mocked `Game.creeps` — both mocks are part of this
milestone's test-helper work, like snapshot's were at M1):

- Arrival short-circuits and clears cache; fatigue neither steps nor stuck-counts nor
  advances `idx`.
- Cache: same-destination reuse (one PathFinder call across ticks); destination change
  invalidates; moved → advance, unmoved → re-issue same direction + stuckCount.
- Stuck: exactly one re-search at stuckTicks, with a **cloned** matrix containing creep
  stamps (stub asserts the shared matrix is untouched).
- Budget: pool/count exhaustion leaves excess creeps unmoved this tick and intact next
  tick; per-search ops = min(maxOpsPerSearch, remaining pool).
- Incomplete result still steps.

Sim: exercised constantly by the M2 gate (every hauler round trip); assertions are
indirect (throughput + zero errors). Movement-specific sim scenarios arrive with M4.
