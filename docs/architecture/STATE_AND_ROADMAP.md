# State & Roadmap

**Snapshot: July 2026, at commit `ea401d6`.** What is actually built, how healthy each
subsystem is, what is known-broken or fragile, and what to build next — in order.
Verified against: `npm run test` (117 unit + 3 integration, green) and the
`remote-mining` sim regression (700 ticks in the real engine, 6/6 green).

Companion docs: [MODULAR_ARCHITECTURE](MODULAR_ARCHITECTURE.md) (the design),
[ENERGY_FLOW_SPAWNING](ENERGY_FLOW_SPAWNING.md) (the spawning brain),
[LOGISTICS_ROUTING](LOGISTICS_ROUTING.md) (energy routing),
[EMPIRE](EMPIRE.md) (remote mining). This doc is the *status* overlay on those:
where the implementation is ahead of, behind, or diverging from them.

---

## 1. Where we are

The single-room economy is mature and self-regulating: jobs, capability matching,
the energy-flow spawn model, and ledger-based logistics all work and are the
best-tested code in the repo. The empire layer (remote mining) is **built end to
end** — all nine stages of [EMPIRE](EMPIRE.md)'s staged build landed in June,
including reservation and abandon-on-threat — and the full loop passes in the
real engine.

The frontier problems are no longer "does energy flow": they are

1. **hard ceilings** — the base planner stops producing new infrastructure at
   ~RCL4 and never builds a tower, so a naturally-grown room is defenseless and
   RCL5+ is cosmetic;
2. **edge-case fragility** in the remote/scouting paths (a class of "remote
   miner never assigned / never arrives" bugs — §4);
3. **three subsystems that are still stubs** — expansion, combat, and defender
   spawning — which are exactly the capabilities the empire goal needs next.

## 2. What we have — subsystem inventory

| Subsystem | Where | Maturity |
|---|---|---|
| Tick pipeline | `src/main.ts` | solid |
| Jobs (board + 5 kinds + remote gen) | `src/jobs/` | solid |
| Matching (capability + scope + stickiness) | `src/matching/` | solid |
| Actions/logistics (executors, ledger, routing) | `src/actions/` | solid |
| Spawning (economy) | `src/spawn/` | solid |
| Energy-flow model | `src/economy/EnergyModel.ts` | solid — the crown jewel |
| World read model + CPU scheduler | `src/world/`, `src/cpu/` | solid |
| Empire / remote mining | `src/empire/`, `RemoteJobGenerator` | real but thin (§4) |
| Scouting / intel | `src/intel/` | works, fragile edges (§4) |
| Defense | `src/defense/` | **thin — cannot spawn defenders** |
| Base building | `src/base/BasePlanner.ts` | **thin — ceiling ~RCL4, no towers** |
| Expansion | `src/expansion/Expansion.ts` | stub (wired, inert) |
| Combat | `src/combat/Combat.ts` | stub (wired, inert) |

### The solid core

- **Pipeline** (`src/main.ts`): bootstrap → world → scouting → empire → defense →
  jobs → base → expansion/combat → reconcile/prune → economy sense → spawn →
  match → towers/controllers/executors → persist. Every phase is `guard()`-isolated
  (a throw logs and skips, the tick continues). The two-contract discipline
  (`Job`, `SpawnRequest`) and the three-registry extension model are honored in
  practice, not just on paper.
- **Jobs**: Harvest (per source, capacity = walkable seats ≤5), Haul, Build,
  Repair (roads/containers only), Upgrade (the elastic residual sink), plus
  remote Harvest/Haul upserted per active remote from `Memory.empire` + intel.
  Deterministic ids; prune tolerates invisible rooms.
- **Matching**: capability is the only hard gate; `jobNeeded` encodes "mine only
  as a last resort" off body shape; stickiness rules keep churn low; the scope
  gate (`targetRoom ?? home`) pins remote creeps to their remote.
- **Logistics**: pure argmax scorers + sticky committed targets + an ephemeral
  per-tick reservation ledger rebuilt from live creep state — self-healing by
  construction.
- **Energy model**: three-stage flow (income → logistics → elastic consumer)
  with storage EMA + trend; population is an output, never a knob. Home
  infrastructure takes every spawn slot before remotes compete; remotes outrank
  only the elastic consumer.
- **Empire**: throttled remote allocation from intel (nearest-owner with
  hysteresis, ≤2 remotes/room), per-tick threat re-check with abandon/reactivate,
  scout + reserver `SpawnRequest`s (reservers gated to RCL4+), and
  fold-back-to-home for creeps whose remote deactivated.

### The known ceilings (measured, not speculative)

- **Base planner** auto-places only: extensions (ring checkerboard), storage at
  RCL4, source containers at RCL3+, roads (spawn↔sources, spawn↔controller).
  It **never** places: towers, links, terminal, labs, extractor, ramparts,
  walls, controller container, a 2nd/3rd spawn, observer, factory, nuker, power
  spawn. Autonomous room development therefore tops out at ~RCL4 — the
  controller keeps leveling but the room gains nothing new. The `full-base`
  RCL8 sim scenario is hand-built, not something the bot can construct.
- **Defense** (`assessDefense`) tracks threat and can pop safe mode as a last
  resort, and towers (if any exist) attack/heal/repair — but it **returns no
  spawn requests**: Defender/Soldier bodies exist in `bodies.ts` and nothing in
  the codebase ever requests one. Combined with "no auto-towers," a
  naturally-grown room's only defense is safe mode.
- **Creep actions**: no boosting, renewing, link/terminal transfers, mineral
  handling, or rampart/wall repair.
- **Dead code** (candidates for deletion next touch): `JobBoard.demand()` /
  `openByKind()`, `SpawnManager.run`'s unused `_board` param, `FLEX_WORKERS`,
  `DEFENSE_REQUEST_PRIORITY`, `memory/prune.ts`, `tasks/Task.ts`.

## 3. Recently fixed (June 2026) — for the record

The instability remembered from the remote-mining bring-up was real; each issue
below is **fixed on `main`** and most are pinned by a test or sim assertion:

| Symptom | Root cause | Fix (commit) |
|---|---|---|
| Home never specialized; remotes stole dedicated-miner spawn slots | Home "coverage" counted worker WORK, so worker-heavy rooms read as covered | Home infra now takes every slot before remotes compete (`ea401d6`); sim asserts home keeps dedicated miners |
| Cross-room haulers bounced on room borders | Creep lingered on the exit tile; border ambiguity ping-ponged it between rooms | `clearExitTile` nudge in `runRemoteHaul` (`ea401d6`) |
| Reservers requested before the room could afford CLAIM | No RCL gate on reservation | `RESERVE_MIN_RCL = 4` (`afb90a4`) |
| Bootstrap creeps herded onto one source | Harvest jobs were capacity-1 | Capacity = walkable seats (`afb90a4`) |
| Remote gap below `SPECIALIZE_ENERGY` spawned a useless generalist | Bootstrap fallback ignored `targetRoom` | Remote gaps always spawn a small dedicated miner/hauler pair (`afb90a4`) |

## 4. Known issues & fragilities

**Stage A (July 2026) closed the top of this list.** Items 1, 2, 3, 5, and 6
below are **fixed on `main`**, each pinned by unit tests and (for the
remote/threat paths) by sim regressions. Kept here with their original analysis
for the record; the still-open items follow.

### Fixed in Stage A

1. ~~**An unaffordable controller request freezes ALL spawning in that room.**~~
   A pending `remote-reserve:*` request (≥650 energy) used to block every spawn
   while the room held less — priority inversion that left dead home miners
   unreplaced. **Fixed:** the recovery floor now outranks requests, and an
   unaffordable request is skipped (next request, then economy demand) while
   energy banks toward it (`src/spawn/SpawnManager.ts` `decide`). A request that
   can never fit the room's capacity warns instead of silently stalling.

2. ~~**Remote miners crawl: single MOVE regardless of distance.**~~ A remote
   miner spent ~250 of its 1500 ticks walking one tile per five. **Fixed:**
   remote miners get one MOVE per WORK (`remoteMinerBody`,
   `src/spawn/bodies.ts`) — full speed on plains; home miners keep the cheap
   single-MOVE parked body.

3. ~~**Scope-locked creeps can idle to death.**~~ The matcher pinned
   `targetRoom` creeps to their remote with no fallback; an intel gap or full
   job stranded them permanently — the literal "remote miners not being
   assigned" bug. **Fixed:** a pinned creep holding *nothing*, with nothing
   eligible in its remote, falls back to home-scope work; the held home job
   reads as out-of-scope so the creep is pulled back the moment a remote job
   reopens, and a creep holding a remote job is still never poached
   (`src/matching/Matcher.ts` `assign`). Remote harvest jobs also carry a
   second seat so an undersized low-energy miner can be topped up instead of
   stranding its replacement (`RemoteJobGenerator.ts`).

5. ~~**Missing intel is treated as safe.**~~ **Fixed:** a remote with neither
   vision nor intel (e.g. post-migration wipe) is paused until a scout
   re-establishes what's in it (`src/empire/Empire.ts` `updateRemoteThreat`).

6. ~~**Scouts suicide into dangerous neighbors, forever.**~~ **Fixed:**
   player-owned and Source-Keeper neighbors are skipped by the sweep and only
   re-checked every `SCOUT_STALE_TICKS × SCOUT_DANGER_STALE_MULT` (30k) ticks;
   they no longer re-demand a scout every staleness window either
   (`src/intel/scout.ts` `scoutDue`, used by both the sweep and
   `scoutRequest`). Rooms with mere hostile *creeps* stay in the normal sweep —
   invaders expire, and paused remotes need re-verification to reactivate.

### Open

4. **Threat flapping tears down the whole remote workforce.** One invader →
   `active=false` → all creeps retreat and jobs are swept; every wave rebuilds
   the workforce from scratch. The pause → clear → resume cycle itself now
   *works* and is sim-tested (`remote-invader`), but it's still teardown, not
   pause-in-place. **Fix direction: creeps shelter but stay assigned +
   defender dispatch (Stage B).**

7. **Remotes are gated behind *full* home specialization, which a struggling
   room may never reach.** Home-miner supply counts only WORK-only creeps
   (`src/economy/EnergyModel.ts:347-361`); a room stuck under
   `SPECIALIZE_ENERGY` (550) reads a permanent home deficit and never funds a
   single remote creep — invisible from the outside. Deliberate for now (home
   first is the guardrail that fixed the June specialization bug); revisit if
   real rooms plateau.

8. **Multi-hop remotes are chronically under-hauled.** The hauler CARRY target
   scales with distance, but `REMOTE_POP_HEADROOM` (5) and haul job capacity
   (`max(2, sources*2)`) don't — three unreconciled bounds. One-hop remotes are
   fine; two-hop remotes never pay off and look broken. Defer until remote
   roads exist (roads change the math anyway).

## 5. Verification state

- **Unit** (~127 cases): heaviest exactly where the risk is — energy model,
  logistics, empire, remote demand, matching. Mocked engine.
- **Integration** (3): jobs + matching + memory over the priority ladder.
- **Sim** (real engine, Docker): `economy` (RCL1 bootstrap, 180t),
  `defense` (pre-built towers clear a wave, 25t), `full-base` (RCL8 steady
  state, 30t), `remote-mining` (700t: scout → allocate → reserve → mine, home
  keeps specializing, CPU < 50). All green as of this snapshot.
- **Coverage added in Stage A:**
  - `remote-mining` now runs 900 ticks and asserts a hauler reaches the remote.
    This assertion FAILS on the pre-Stage-A code: in the old baseline no hauler
    ever reached the remote inside any tested window (the 1-MOVE miner crawled,
    income came late, and the hauler — spawned only after income exists, 26
    parts ≈ 78 ticks of spawn time alone — never made it). The "green" suite
    had never actually seen remote energy hauled.
  - New `remote-invader` scenario + sim test (900t): remote paused while
    hostiles camp it, no miners/reservers marched in, reactivated and mined
    after the hostiles age out, CPU bounded.
  - Unit coverage for: spawn freeze/floor-vs-request ordering, remote miner
    body, matcher scope fallback + pull-back + no-poach, unknown-intel pause,
    scout danger avoidance (sweep and request suppression).
  - `bin/sim test` now runs test files **serially**: two concurrent ~900-tick
    engines degrade each other ~3x on a typical Docker Desktop allotment and
    blow the per-test timeouts. Use `-- --grep <name>` to iterate on one.
- **Remaining coverage gaps:**
  - No storage-growth assertion (delivery volume) — hauler arrival is asserted,
    energy accounting isn't; the scenario's pre-filled 500k storage makes a
    growth assertion meaningless as-is.
  - No struggling-home scenario (#7): the sim hands over a healthy RCL4 room.
  - Nothing asserts base-planner *progression* (extensions/storage actually get
    built from a bare room over time).

## 6. Roadmap — what we have yet to do

Ordered stages; each unblocks the next. (Tracks A/B can interleave; C depends
on B; D depends on C existing.)

### Stage A — Harden remote mining ✅ (done July 2026)

Closed §4's high items plus the test gaps that let them hide: economy fallback
past unaffordable requests (+ floor-first), paired-MOVE remote miner bodies,
matcher home-scope fallback with pull-back, unknown-intel-≠-safe, scout danger
avoidance, hauler-arrival sim assertion, and the `remote-invader`
pause → clear → resume sim regression. Still open from §4: threat-flap teardown
(#4, needs defender dispatch — Stage B), the home-specialization gate (#7,
deliberate), multi-hop under-hauling (#8, waits for remote roads).

### Stage B — Raise the room ceiling: defense + base plan to RCL6

The two thin subsystems, together, because towers are both the defense fix and
the first missing structure:

1. **Auto-towers in `BasePlanner`** (RCL3: 1, scaling up per RCL) — the single
   highest-value structure the bot cannot currently build.
2. **Defender spawning**: `assessDefense` emits Defender `SpawnRequest`s scaled
   to the threat (bodies already exist; `commandCombatCreep` seam already
   routes). Includes remote-defender dispatch to close #4 properly.
3. **Base plan to RCL6**: controller container, links (source→controller/storage
   — the link-economy goal), terminal at RCL6, ramparts on spawn/storage/towers
   + a rampart/wall repair path (new `Fortify` job kind or widened Repair).
4. **Remote roads** (cross-room lanes) — fixes hauler MOVE efficiency and
   re-opens the multi-hop math (#8).

Exit criterion: a fresh room grows itself to RCL6 with towers, links, terminal,
and ramparts, and repels the `under-attack` scenario *without* hand-built
structures.

### Stage C — Expansion (the big unlock)

The `expansion` stub becomes real, per [EMPIRE](EMPIRE.md) §Future ("bootstrap
help"): score claim candidates from intel (sources, swamp ratio, distance,
neighbors), claim at GCL headroom, send pioneers (build spawn, then hand off to
the normal economy), inject energy via the existing cross-room haul primitive.
Everything rides existing seams: `SpawnRequest` + `targetRoom` +
`commandExpansionCreep`. New sim scenario: claim + bootstrap a second room to
self-sufficiency.

### Stage D — Combat and the long tail

- **Combat** (`planCombat`): squads, formation command, defense-help across
  rooms (military currency through the empire broker).
- **Market/terminal network** once ≥2 terminal rooms exist.
- **Source-keeper rooms** (needs combat), labs/boosts, extractor/minerals,
  power, per-source remote splitting — in whatever order play demands.

### Why this order

A: cheap fixes to the system just built, while it's fresh — and every later
stage multiplies remote count, so per-remote bugs compound. B before C: an
expansion room is a weak room; claiming one before rooms can defend themselves
and grow past RCL4 just creates liabilities. C before D: offense needs an
economy that can fund it, and multi-room income is that economy.

## Appendix — key tuning constants (`src/config/constants.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `SCOUT_INTERVAL` | 10 | Passive intel refresh cadence (ticks) |
| `SCOUT_STALE_TICKS` | 3000 | Intel age that triggers re-scouting |
| `EMPIRE_INTERVAL` | 50 | Remote allocation recompute cadence |
| `REMOTE_MIN_RCL` | 1 | Min RCL to mine remotes |
| `RESERVE_MIN_RCL` | 4 | Min RCL to fund reservers (CLAIM ≥650) |
| `REMOTE_MIN_POP` | 2 | Min home population before remote work |
| `REMOTE_POP_HEADROOM` | 5 | Extra pop cap per active remote |
| `MAX_REMOTES_PER_ROOM` | 2 | Allocation cap per owner |
| `SPECIALIZE_ENERGY` | 550 | Capacity at which generalists → dedicated bodies |
