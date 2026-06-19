# Modular Architecture (current)

This describes the AI as it exists after the June 2026 restart and is the
authoritative design reference. The companion docs ([REPO_MAP](../agents/REPO_MAP.md),
[SPAWN_REQUEST_CONTRACT](SPAWN_REQUEST_CONTRACT.md),
[ENERGY_FLOW_SPAWNING](ENERGY_FLOW_SPAWNING.md), and the QA docs) all track this design.

## Goal

Maximal modularity: every subsystem has one home and communicates only through
two shared contracts, so each part can be improved in isolation.

## Layers

```
Foundations (every tick):  Memory · World read-model · CPU/Scheduler · Economy sensing
Intel:                     Scouting -> RoomIntel
Strategy (produce work):   Economy generators · Base planner · Defense · Expansion* · Combat*
Shared services (staff it): JobBoard · EnergyModel · SpawnManager · Matcher · Action executors
Tactical execution:        Towers · controller-commanded creeps · job executors
```
`*` = seam only (no-op stub wired into the pipeline; expand by filling in).

## Two shared contracts

1. **`Job`** (`src/jobs/types.ts`) — persistent unit of economic/build work with
   a labor `demand`, stored in `Memory.jobs` under a **deterministic id** so
   regeneration upserts in place. Produced by generators, consumed by matching
   and spawning.
2. **`SpawnRequest`** (`src/spawn/types.ts`) — a controller subsystem
   (defense/combat/expansion) asking for a creep through the shared spawn
   service, with a priority and an `owner` tag.

`SpawnManager` merges aggregated job demand + spawn requests + a population floor.
Economy creeps are job-matched; controller creeps (those with
`CreepMemory.controller` set) are commanded imperatively by their subsystem and
skipped by the matcher (the **hybrid command model**).

## Three registries (where new capabilities plug in)

| Registry | File | Add to support a new job kind |
|---|---|---|
| Generators | `src/jobs/generators/index.ts` | how/when the job is created |
| Capability | `src/matching/capability.ts` | parts a creep needs to perform it |
| Executors | `src/actions/executors/index.ts` | how a creep performs it |

Adding a kind touches only these three; the pipeline, JobBoard, Matcher, and
SpawnManager are untouched.

## Tick pipeline (`src/main.ts`)

1. Memory bootstrap + migrations
2. Clean dead creeps
3. Build `World`
4. Scouting (throttled)
5. Strategy: `assessDefense`, `generateJobs`, `planBase` (throttled),
   `planExpansion`/`planCombat` (stubs) — post jobs + spawn requests
6. `JobBoard.reconcile()` + `prune()`
6.5 `senseEconomy()` — update each room's storage EMA/trend integrator
7. `SpawnManager.run()` (energy-flow demand + requests + floor)
8. `Matcher.assign()` (sticky: idle economy creeps only)
9. Tactical: `runTowers`, `commandControllerCreeps`, per-creep `runCreep`
10. `JobBoard.persist()`
11. Opportunistic pixel generation

## Key decisions

- **Persistent jobs**, deterministic ids, self-healing via `reconcile`/`prune`.
- **Capability + need matching** — a creep takes a job only if it *can* do it
  (body parts) AND the job is *needed* now. Need is what makes mining a last
  resort: a creep with CARRY mines only when there is no energy to collect
  (dropped/containers/storage); hauling counts as work only when there is energy
  to move. Creeps re-decide whenever they empty out (not once-for-life), so they
  follow changing need; a small switch rule keeps churn low. Swappable
  (`src/matching/Matcher.ts`).
- **Energy-flow-driven spawning + floor** — population is an *output* of a
  per-room flow model ([EnergyModel](../../src/economy/EnergyModel.ts)): targets
  for income (saturate sources), logistics (carry sized to income × distance),
  and consumption (elastic upgrade, gated by a storage band) are measured each
  tick, and `SpawnManager` spawns the largest deficit. A wiped room always
  recovers via a guaranteed generalist. Full design:
  [ENERGY_FLOW_SPAWNING](ENERGY_FLOW_SPAWNING.md).
- **Capability-based assignment** — `CreepMemory` carries no behavioral role;
  `spawnRole` is a body/population tag only. Even the "mine as a last resort"
  rule keys off the body (has CARRY?), not the role tag.
- **Single-action execution now; task chaining later** — insertion point is
  documented in `src/actions/executors/index.ts` (`runCreep`), seam in
  `src/tasks/Task.ts`.

## Memory ownership

| Key | Owner |
|---|---|
| `Memory.version` | kernel / migrations |
| `Memory.jobs` | jobs |
| `Memory.creeps[n]` | spawn/creeps (`spawnRole`,`home`,`working`,`jobId?`,`controller?`) |
| `Memory.rooms[n].intel` | scouting |
| `Memory.rooms[n].base` | base planning |
| `Memory.rooms[n].defense` | defense |
| `Memory.rooms[n].economy` | energy-flow controller (storage EMA/trend) |
| `Memory.planRuns` | scheduler |

## Status

Built now: foundations, jobs (harvest/haul/upgrade/build/repair), matching,
actions, **scored energy logistics** (source/sink/build selection by blended
value-vs-distance, `src/actions/logistics.ts`), **energy-flow-driven spawning**
(`src/economy/EnergyModel.ts`, see [ENERGY_FLOW_SPAWNING](ENERGY_FLOW_SPAWNING.md)),
defense (towers + threat/safe-mode), base planning (containers + extensions +
storage at RCL4 + roads on hauling lanes), passive scouting.

Seams only: task chaining, expansion, combat (offensive), full base layout,
defender/rampart logic, links/terminal/labs, remote mining.
