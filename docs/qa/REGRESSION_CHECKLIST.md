# Regression Checklist: Lightweight Review

Use this for surgical changes to **Memory**, **jobs/matching**, or **spawning**. A lightweight
alternative to the full [Review Checklist](REVIEW_CHECKLIST.md), focused on multi-tick stability.

---

## 1. Memory & State

- [ ] **Ambient types**: new field in `src/main.ts` (`Memory`/`CreepMemory`/`RoomMemory`)?
- [ ] **Bootstrap/migration**: initialized in `src/memory/bootstrap.ts`; existing data handled per
      [MEMORY_MIGRATIONS.md](MEMORY_MIGRATIONS.md)? (`Memory.jobs` is safe to wipe — it regenerates.)
- [ ] **Stale data**: bounded growth; aging data has a timestamp.

## 2. Jobs, Matching & Spawn

- [ ] **Deterministic ids**: generator upserts in place (no duplicates per tick)?
- [ ] **Capability + executor**: new job kind wired into `matching/capability.ts` and
      `actions/executors/index.ts`?
- [ ] **Floor**: a room at 300 energy with no workers still spawns a generalist?
- [ ] **Demand self-limits**: open-slot demand drops to zero as the matcher fills slots?
- [ ] **Priority**: a controller `SpawnRequest` won't starve the economy (or vice versa)?

## 3. CPU Efficiency

- [ ] **Hot paths**: no redundant `find`/`lookAt`/pathfinding per creep or tick; reads from `WorldRoom`?
- [ ] **Throttling**: a new heavy pass is registered with `Scheduler.shouldRun`?

## 4. Multi-Tick Failure Modes (watch in sim, 100+ ticks)

| Area | Failure mode | Success metric |
| :--- | :--- | :--- |
| Spawn priority | Death spiral | `room.energyAvailable` recovers after a mass-death |
| Body design | Throughput collapse | creeps move with ~0 fatigue; economy stays positive |
| Prune/reconcile | Lost labor / idle creeps | jobs stable; no stale `jobId`s |

## 5. Gating Checks

- [ ] `npm run build` passes.
- [ ] `npm run test` passes (17 unit + 1 integration).
- [ ] Multi-tick validation: ~100+ ticks in the simulator or a private server.
