# Screeps Primer

This file summarizes the Screeps rules that matter most when editing this repository.

## Runtime Model

- Screeps runs your code once per game tick.
- The world persists between ticks, but your JavaScript global state can reset at any time.
- `Memory` persists across ticks and is the durable store for task and creep state.
- This repo also persists planner cadence in `Memory.planRuns`, so scheduling changes can have cross-tick effects even when the code path looks stateless.

## Map Model

- The MMO world is composed of 50x50 rooms connected to neighboring rooms.
- Expansion, remote mining, and scouting require reasoning across room boundaries rather than within a single map.

## Economy Model

- Creeps are built from body parts. Each body part adds energy cost and changes what a creep can do.
- Common body economics relevant here:
  `WORK` harvests and builds/upgrades.
  `CARRY` moves resources.
  `MOVE` offsets terrain and body weight.
- Standard creeps have finite lifetimes, so the spawn pipeline must replace labor before throughput collapses.

## Control Model

- Owned rooms depend on the room controller level for structure limits and economic capacity.
- Spawn and extension energy availability constrains which body layouts are legal in a given tick.

## CPU Model

- Every tick has a CPU limit plus a bucket that absorbs bursts.
- Hot-path code should avoid redundant searches, excess pathfinding, and unnecessary object churn.
- Logging in per-creep or per-room loops can become a real performance problem.
- In this repo, the CPU bucket is part of gameplay behavior: non-critical plans are delayed or skipped when the bucket is low, and pixels are generated when the bucket is high.

## Implications For This Repo

- Task logic should be stable across many ticks, not just correct for a single call.
- Remote mining changes often have second-order effects on hauling and spawn demand.
- Room intel and scouting data become stale, so code should tolerate partial information.
- Memory migrations need explicit handling because old data can survive long after code changes.
- Plan changes should be reasoned about in terms of both execution order and interval throttling.
- Tower behavior is a distinct execution phase after task assignment and before creep actions, so defense changes may bypass normal task logic.

## Official References

- Screeps documentation home: https://docs.screeps.com/
- Game overview: https://docs.screeps.com/overview.html
- Game concepts: https://docs.screeps.com/game-play.html
- API reference: https://docs.screeps.com/api/
