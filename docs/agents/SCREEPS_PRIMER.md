# Screeps Primer

This file summarizes the Screeps rules that matter most when editing this repository.

## Runtime Model

- Screeps runs your code once per game tick.
- The world persists between ticks, but your JavaScript global state can reset at any time.
- `Memory` persists across ticks and is the only durable store for bot state.
- The game runtime is **Node.js 24 (V8 13.6)** as of the April 2026 server upgrade (it previously ran Node 10). Code is sandboxed via isolated-vm, so the JavaScript language and built-ins are fully modern, but host-only Node APIs (`fs`, `process`, `require('crypto')`, real timers) are not available.
- This repo compiles to **`es2024`** (see `tsconfig.json`). Modern syntax and built-ins — optional chaining, nullish coalescing, logical assignment, `Array.at`/`findLast`/`toSorted`/`with`, `Object.hasOwn`/`groupBy`, `String.replaceAll` — run natively rather than being transpiled away, which keeps the bundle smaller and faster.

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
- Spending down to the bucket earns nothing; a full bucket (10k) can be converted into pixels.

## Implications For Any Bot Design

- Logic should be stable across many ticks, not just correct for a single call — most bugs here are multi-tick bugs.
- Room data goes stale the moment you lose visibility, so code should tolerate partial information.
- Old `Memory` data can survive long after the code that wrote it changes, so schema changes need explicit handling.

## Official References

- Screeps documentation home: https://docs.screeps.com/
- Game overview: https://docs.screeps.com/overview.html
- Game concepts: https://docs.screeps.com/game-play.html
- API reference: https://docs.screeps.com/api/
