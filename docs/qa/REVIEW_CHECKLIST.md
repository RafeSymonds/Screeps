# Review Checklist: Risky Gameplay Changes

Use this when changing **Memory schemas**, **jobs/matching**, **spawning**, or **deployment tooling** —
the systems with high cross-tick impact that can cause unrecoverable death spirals or broken builds.
For small surgical changes, see the [Regression Checklist](REGRESSION_CHECKLIST.md).

---

## 1. Memory & Persistence

- [ ] **Ambient types**: new field added to the right interface in `src/main.ts`
      (`Memory`/`CreepMemory`/`RoomMemory`)?
- [ ] **Bootstrap**: does `src/memory/bootstrap.ts` initialize the new collection/field?
- [ ] **Migration**: type/location changes follow [MEMORY_MIGRATIONS.md](MEMORY_MIGRATIONS.md)? Remember
      `Memory.jobs` is regenerated each tick, so wiping it is usually a safe reset.
- [ ] **Serialization**: survives `JSON.stringify/parse`? Avoid `Map`/`Set` in `Memory`.
- [ ] **Bloat / staleness**: bounded growth? Aging data carries a `lastSeen`/`lastUpdated` timestamp?

## 2. Jobs & Matching

- [ ] **Deterministic id**: does the generator upsert by a stable id (e.g. `harvest:<sourceId>`) so it's
      idempotent — no duplicate jobs each tick?
- [ ] **Validity / prune**: does `isJobValid` (in `src/jobs/JobBoard.ts`) correctly retire the job when
      its target/condition is gone, while tolerating loss of room vision?
- [ ] **Capability**: does a new job kind have a `capability.ts` entry so only able-bodied creeps match?
- [ ] **Executor**: does the new kind have an executor registered in `actions/executors/index.ts`, and
      does `runCreep` handle a missing/invalid job without throwing?
- [ ] **Sticky matching**: does the change preserve assignments (only idle creeps re-match), avoiding
      per-tick thrash?

## 3. Spawn Balance & Labor

- [ ] **Floor preserved**: a room with zero/no-WORK creeps still spawns a generalist with on-hand energy?
- [ ] **Demand self-limits**: `job.demand` × open slots falls to zero as the matcher fills slots (no
      runaway spawning)?
- [ ] **Affordability**: the generated body satisfies `bodyCost(body) <= room.energyAvailable`?
- [ ] **Priority**: can a controller `SpawnRequest` starve the economy (or vice versa)? See the
      [Spawn Request Contract](../architecture/SPAWN_REQUEST_CONTRACT.md).
- [ ] **Replacement cadence**: when a creep dies, does demand reappear in time to avoid a throughput gap?

## 4. CPU & Scheduling

- [ ] **Throttling**: a new heavy pass runs via `Scheduler.shouldRun(key, interval)` and respects
      `CpuBudget` tiers (critical passes — defense, economy generation — stay every-tick)?
- [ ] **Hot paths**: avoids redundant `find`/`lookAt`/pathfinding per creep or per tick? Reads from
      `WorldRoom` instead of scanning ad hoc?
- [ ] **Scaling**: no O(n²) loops over creeps/jobs/rooms.

## 5. Deployment & Tooling

- [ ] **Build**: `npm run build` passes (bundles `src/main.ts` → `dist/main.js`).
- [ ] **Path aliases**: imports respect the `src/` base URL in `tsconfig.json`.
- [ ] **Secrets**: no changes to `screeps.json` or other ignored config committed.
- [ ] **Private server**: `deploy`/`SCREEPS_LOCAL_PATH` still work if deploy scripts changed.
- [ ] **Runtime**: Screeps is Node 24 / `es2024`; host-only Node APIs (`fs`, `process`, `crypto`,
      timers) remain unavailable in the sandbox.

## 6. Multi-Tick Failure Modes (watch in sim, 50–200 ticks)

| Change area | Failure mode | Detection |
| :--- | :--- | :--- |
| Spawn priority | **Death spiral**: economy starved by controller requests | `room.energyAvailable` stays low while non-economy creeps spawn |
| Body scaling | **Throughput collapse**: creeps too slow/expensive | fatigue > 0 most of life; one death halts the room |
| Job demand | **Over/under-spawn**: wrong `demand`/`capacity` | population overshoots slots, or slots stay unfilled |
| Prune/reconcile | **Lost labor**: jobs vanish or creeps go idle | `Memory.jobs` churns; creeps with stale `jobId` |

## 7. Baseline Compliance

- **Mandatory**: `npm run build` passes; `npm run test` passes (17 unit + 1 integration).
- **Lint**: currently blocked repo-wide by the `es2024` parser issue — not a gate; verify by build+tests.
- **Dry-run**: for complex logic, watch the first ~100 ticks in the simulator or a private server.
