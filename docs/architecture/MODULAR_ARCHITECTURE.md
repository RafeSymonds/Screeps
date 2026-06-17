# Modular Architecture (current)

This describes the AI as it exists after the June 2026 restart. The older docs
under `docs/agents/` and `docs/architecture/ECONOMY_DECOMPOSITION.md` describe a
previous bot that was deleted and do **not** match the current code.

## Goal

Maximal modularity: every subsystem has one home and communicates only through
two shared contracts, so each part can be improved in isolation.

## Layers

```
Foundations (every tick):  Memory · World read-model · CPU/Scheduler
Intel:                     Scouting -> RoomIntel
Strategy (produce work):   Economy generators · Base planner · Defense · Expansion* · Combat*
Shared services (staff it): JobBoard · SpawnManager · Matcher · Action executors
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
7. `SpawnManager.run()` (demand + requests + floor)
8. `Matcher.assign()` (sticky: idle economy creeps only)
9. Tactical: `runTowers`, `commandControllerCreeps`, per-creep `runCreep`
10. `JobBoard.persist()`
11. Opportunistic pixel generation

## Key decisions

- **Persistent jobs**, deterministic ids, self-healing via `reconcile`/`prune`.
- **Sticky matching** — a creep keeps its job until done/invalid; only idle
  creeps enter matching. Strategy is swappable (`src/matching/Matcher.ts`).
- **Demand-driven spawning + floor** — open job slots define demand; live parts
  define supply; a wiped room always recovers via a guaranteed generalist.
- **Capability-based assignment** — `CreepMemory` carries no behavioral role;
  `spawnRole` is a body/population tag only.
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
| `Memory.planRuns` | scheduler |

## Status

Built now: foundations, jobs (harvest/haul/upgrade/build), matching, actions,
spawning, defense (towers + threat/safe-mode), minimal base planning
(containers + extensions), passive scouting.

Seams only: task chaining, expansion, combat (offensive), full base layout,
defender/rampart logic, links/terminal/labs, remote mining.
