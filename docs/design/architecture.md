# Bot Architecture (v2)

Status: **draft — revised after fresh-context (Goldfish) comprehension + critic review**
Owner doc for the whole bot. Every subsystem listed here gets its own design doc in
`docs/design/` before it is built; this document is the map they must fit into.

## 1. The Problem

We are building a fully autonomous Screeps bot for the official MMO. It must run unattended
for weeks: bootstrap a room from a single spawn, keep its economy alive, defend itself,
mine neighboring rooms, and expand into new rooms as GCL allows — all without a human
placing a flag or typing a console command.

The previous bot (preserved on `backup/pre-rebuild-2026-07-19`) was scrapped not because it
didn't work, but because it became too hard to understand: its behavior emerged from stacked
scoring systems that no one could predict or debug. This rebuild treats **comprehensibility
as a survival trait**. The second binding constraint is **CPU**: we start with 20 CPU/tick
on the official server, and empire ambitions mean every room must run on a small, measured
slice of it.

## 2. Goals (ranked) and Non-Goals

1. **Unattended MMO survival.** The bot runs for weeks without intervention: bootstraps from
   one spawn, perpetually respawns its own labor, recovers from partial wipes and full
   respawns, and never bricks itself on a global reset, a bad Memory state, or a thrown
   exception in one room.
2. **Empire growth.** GCL climbs continuously: efficient owned rooms, remote mining, and
   fully automatic expansion — scout, score, claim, bootstrap, repeat.
3. **Survive a hostile sector.** Detect threats early; repel NPC invaders and casual player
   raids. Defense is first-class. Offense gets a seam, not an implementation.
4. **Every subsystem understandable in isolation.** Operational test: a fresh reader (human
   or fresh-context session) can take one subsystem's design doc plus the shared contracts
   and reimplement that subsystem without touching or reading its consumers.

**Non-goals for now** (architecture leaves seams — §7 — but no specs, no code): offensive
PvP, market/terminal trading, labs and boosting, factories, power creeps, seasonal servers.

**Scope statements.** The bot is **shard-local**: it operates on one shard and intel ignores
portals. "Fully autonomous" has exactly **one human touchpoint**: placing the first spawn in
the UI after account respawn — inherent to the game, not a design gap.

### Definition of "it works"

- Sim: a fresh RCL1 world (`default` scenario) reaches RCL3+ unattended with zero uncaught
  errors; `wiped-base` re-bootstraps its workforce; `under-attack` survives the scripted
  wave; `remote-mining` shows net-positive remote income.
- MMO, measured by telemetry counters (§5.15), over a 7-day unattended run: zero uncaught
  exceptions, zero rooms lost, average CPU ≤ 80% of limit, spawn uptime above a threshold
  set in the telemetry doc, and a global-reset count that stays in a sane band.

## 3. The Technical Plan

The organizing idea: **rooms are the unit of economy, the empire is the unit of strategy,
CPU is the currency.**

- Each owned room runs a self-contained economy: it plans its own workforce, spawns it, and
  puts it to work. Rooms do not read each other's state.
- A thin empire layer makes the few decisions that genuinely cross room boundaries:
  where to expand, which room bootstraps a new claim, shard-global safe-mode arbitration,
  (later) inter-room resources.
- A scheduler owns the tick: it runs subsystems in priority order under CPU budgets and
  sheds low-priority work when the bucket is low. Degradation is designed, not accidental.

```
tick ──▶ shell (memory bootstrap, world-discontinuity check, error containment)
           │
           ▼
         scheduler ── priorities + CPU gates ──────────────┐
           │                                               │
           ▼                                               ▼
   ┌─ infra services ─────────┐                ┌─ strategy (throttled) ─┐
   │ snapshot  (per-tick read │                │ empire   (room registry│
   │            model)        │                │  aid, safe-mode arb.)  │
   │ intel     (persistent    │                │ expansion (score/claim/│
   │  room memory + scouting) │                │            bootstrap)  │
   └──────────┬───────────────┘                └───────────┬────────────┘
              ▼                                            │
   ┌─ per owned room (scheduler iterates rooms) ─┐         │
   │ defense      (threat → response ladder)     │◀────────┘
   │ economy      (workforce plan + assignments) │
   │ remotes      (adopted neighbor mining)      │
   │ construction (sequenced build queue)        │
   │ spawn        (demand → spawn intents)       │
   └──────────┬──────────────────────────────────┘
              ▼
   creep execution (one explicit assignment per creep)
              ▼
   movement resolution (batched paths + traffic)
              ▼
   telemetry (stats, CPU per entry, alerts)
```

**Normative tick order** (the diagram is illustrative; this list is the contract):
shell → snapshot → the per-room subsystems in this order: defense assessment + towers
(class A), defense response (class B — demands must precede spawn), layout (interval),
construction (interval — after layout so a fresh plan is consumed the
same tick), empire registry (interval — expansion reads its trigger), intel (interval),
remotes (plan interval + per-tick emission), expansion (decision interval + per-tick
emission), economy, empire aid (re-homes a crippled room's demands — must see this tick's
demands), spawn → creep execution → movement resolution → telemetry flush.
**Every demand producer runs before spawn**: a demand lives exactly one tick, so a
producer scheduled after the resolver emits into a list nobody reads, and an
interval-only producer has an interval-shaped *duty cycle* rather than an
interval-shaped latency (both were M5/M6 review findings). Per-room
subsystems run as **subsystem-major sweeps** (economy over all rooms, then spawn over all
rooms — the scheduler's perRoom iteration), not room-major; same-tick guarantees (economy
feeds spawn) hold either way because demands route by room. The shell doc owns the exact
entry list; reordering it is an architecture change and updates this file.

### Principles (the constitution — subsystem docs must comply)

1. **Pure core, thin shell.** Decision logic is pure functions over plain data (snapshot,
   intel, memory slices in; decisions out). Adapters touch `Game` objects only to build
   snapshots and to execute decided intents. Everything decision-shaped is unit-testable
   on the host.
2. **Behavior is legible from Memory.** Every creep carries one explicit assignment and one
   explicit owner in its memory; room-level state that persists is readable in the room's
   slice (fully derived plans stay derived). "Why did this creep do that?" must be
   answerable by reading Memory, never by mentally composing scoring functions.
   Assignment changes are explicit decisions made by the creep's owning planner, not
   per-tick re-auctions.
3. **Contracts in one place.** Cross-subsystem types live in `src/shared/`; subsystems
   depend on those and never on each other's internals. Categorical values (assignment
   kinds, threat levels, scheduler priorities) are string enums, not bare literals.
4. **One owner per Memory slice.** Each subsystem owns the schema of exactly one slice
   (§6) and all writes flow through its module. Owners may expose *narrow* write accessors
   to others (e.g. `intel.reportSighting()`) — mediated writes are allowed; foreign code
   reaching into another slice is not. Schemas are versioned and migrated or deliberately
   reset on change.
5. **Expensive reads are wrapped once.** `room.find`, pathfinding, and scans live behind
   the snapshot and movement services, cached per tick. No ad-hoc `find` calls in logic.
6. **Errors are contained per room and per subsystem.** The scheduler invokes per-room
   subsystems once per owned room and wraps each (subsystem, room) invocation in its own
   catch + CPU meter; one room throwing must not stop that subsystem for other rooms, and
   one subsystem throwing must not stop the tick.
7. **Global resets are routine — and cheap.** Heap caches are pure optimization; every
   subsystem must rebuild correct behavior from `Memory` + `Game` alone on any tick.
   Resets also *cost* CPU (the bundle's top-level code re-runs): keep module top-levels
   lean, and telemetry counts resets.
8. **CPU feeds back into decisions.** Intents cost a flat 0.2 CPU each, so workforce size
   *is* CPU spend, and creep execution/movement are class A — the scheduler cannot shed
   them. Therefore planners take a CPU allowance as an input and size workforces to it
   (prefer fewer, larger creeps; prefer links over haulers). CPU discipline is enforced
   upstream at planning time, not discovered downstream in telemetry.

## 4. Alternatives Considered and Rejected

These are guardrails. Do not re-litigate them in subsystem docs without updating this file.

- **Generic job market with capability matching (what v1 did — the reason for this
  rebuild).** v1 represented work as: job generators → a persisted JobBoard → a
  capability-gated matcher blending need/priority/staffing/proximity scores → action
  executors → a separate logistics argmax with its own reservation ledger and ~15 tunable
  weight constants — with a fifth "task chaining" layer planned. Any creep could take any
  job its body allowed, so behavior was emergent from the interaction of scoring layers.
  Debugging required simulating the scores mentally; tuning one weight had non-local
  effects. **v2 rule: no marketplace.** The room planner assigns work explicitly; a
  creep's assignment is stated in its memory, and the only "scoring" allowed is choosing
  between explicit candidates inside one pure function.
- **OS-style process kernel** (processes, PIDs, message passing — the Overmind/quorum
  pattern). Powerful, but it's the classic way Screeps bots become incomprehensible, and
  it invites the same emergent-behavior disease as the job market. Our scheduler is a flat,
  static priority list with CPU gates. Boring on purpose.
- **Empire-orchestrated logistics from day one** (cross-room hauling networks, central
  resource allocator). Slightly more optimal, massively more coupled — and it moves the
  economy's correctness into the layer with the least test coverage. Rooms are autonomous
  for their own economy; cross-room resource flow arrives later as a terminal-based empire
  subsystem reading per-room ledgers (§7), which composes instead of entangling.
- **Implementing generic multi-resource logistics now.** We keep energy-only *logic*, but
  resource-typed *schemas* (§7). Generic logic now would be speculative complexity; but
  energy-only schemas would force Memory migrations the moment minerals matter.
- **Per-tick reactive spawning** (look at the room, decide one creep at a time). Causes
  oscillation and starvation-by-noise. Spawning is demand-driven: subsystems declare a
  desired workforce; a resolver diffs desired against alive-plus-queued and fills gaps by
  priority.
- **Pixel generation at 20 CPU.** Generating a pixel drains the entire 10k bucket — our
  only buffer against spikes and throttling. Revisit after CPU subscription.

## 5. Subsystems

Each subsystem below gets its own design doc (`docs/design/<name>.md`) answering the
standard template (goal, interface, memory schema, tick flow, edge cases, test plan).
This section fixes each one's **responsibility, contract sketch, and CPU class** so the
docs have a frame to fit. Interfaces here are sketches — the subsystem doc is the spec.

CPU classes: **A** = every tick, must run (shell, snapshot, creep execution, movement,
towers, telemetry core). **B** = every tick when possible, degrades gracefully (economy
planning, spawn, defense response). **C** = interval/throttled (construction, intel
refresh, scouting, expansion, layout). The scheduler doc staggers class-C intervals so
they don't synchronize on common divisors and spike the same tick.

### 5.1 Shell (`src/shell/`) — class A

Owns `main.ts`'s loop body: Memory bootstrap and versioned migration, dead-creep memory
cleanup, error containment wrappers, and invoking the scheduler. Also owns **world
discontinuity detection**, diffed against a persisted owned-room record in its slice
(account respawn, room lost): on discontinuity it performs a *selective* Memory reset —
wipe room plans, empire registry, and assignments that reference rooms we no longer own;
keep intel. Schema migration and world discontinuity are different events with different
responses; the shell doc specs both.

### 5.2 Scheduler (`src/scheduler/`) — class A

`run(entries: ScheduledEntry[])` where an entry is
`{ id: SubsystemId, cpuClass, interval?, perRoom?, run(ctx) }`. The priority list is
static and subsystem-level; for `perRoom` entries the scheduler iterates owned rooms and
wraps **each (subsystem, room) invocation** in its own catch and CPU meter (principle 6).
Before each invocation it checks remaining CPU and bucket against the entry's class and
skips (with a telemetry mark) instead of blowing the budget. The scheduler owns
degradation policy, and the shed **order** is architectural — class C sheds first, then
B; class A always runs. The actual bucket/CPU thresholds are NOT decided here: the
scheduler's design doc sets them, informed by real telemetry, and they must live in one
named config, not scattered constants.

### 5.3 Snapshot (`src/snapshot/`) — class A

The per-tick read model (v1's `World`, kept — it was one of the good parts). Builds plain
data: `WorldSnapshot { time, rooms: RoomSnapshot[], creeps: CreepView[] }` from `Game`,
cached per tick. Room views are built on demand by the adapter layer, but always
**materialized before any pure core runs** — decision functions receive finished plain
data and never trigger `Game` reads. All `room.find` cost concentrates here.

### 5.4 Intel (`src/intel/`) — class C (scouting/refresh) / A (reads)

Persistent knowledge about rooms we may not currently see: **room type** (normal /
source-keeper / highway / center), terrain summary, source/mineral positions, controller
state, owner, hostile sightings, invader-core sightings, expansion-relevant scores, and a
`lastSeen` tick on everything. Consumers must handle staleness *and absence* — every
consumer contract in this doc tolerates empty intel (that's what makes the build order in
§8 executable). Intel **owns the scout rotation** (which rooms need visits, scout creep
assignments via the normal spawn-demand contract); scouts avoid source-keeper rooms.
Writes from others arrive only through narrow accessors (`reportSighting`,
`flagRemoteUnsafe`) so the schema keeps one owner.

### 5.5 Room economy (`src/economy/`) — class B

The heart. Per owned room, a planner computes a **workforce plan** from snapshot + intel +
layout + a **CPU allowance** (principle 8): which sources get miners of what size, how many
haulers on which routes, upgrader and builder counts for the current RCL, energy state,
and CPU headroom. The plan diffs against living creeps to produce (a) **assignments** —
each creep's memory gets one explicit assignment (`kind` from an enum: mine source S, haul
route R, upgrade, build site B, repair target T, scout room X, …) — and (b) **spawn
demand** for the gaps. Bodies scale with available energy and are not artificially capped
(more WORK per miner = fewer intents = less CPU; fewer, larger creeps beat many small
ones).

Also economy's job, not anyone else's:

- **Infrastructure upkeep.** Roads and containers decay continuously; economy owns the
  repair-target policy for its room's infrastructure and emits repair assignments as
  routine work (defense owns only rampart/wall HP policy, which economy consumes via
  `defense.fortificationTargets(room)` like another work source).
- **Links (RCL5+).** Source→storage→controller link logic is core economy, not endgame:
  one 0.2-CPU link transfer replaces a hauler's entire round trip, making links the
  single biggest lever on principle 8.
- **Controller downgrade guard.** A low `ticksToDowngrade` overrides normal priorities —
  downgrading loses RCL progress and safe-mode activations; the plan always keeps the
  controller fed above the emergency floor.

### 5.6 Spawn (`src/spawn/`) — class B

Pure resolver: `resolve(demands: SpawnDemand[], roomEnergy, spawns) → SpawnIntent[]`.
Demand = `{ role, bodySpec, priority, home, owner, assignmentSeed, boosts? }` (boosts
unused for now — the seam). On spawn, the spawn adapter stamps the newborn's memory with
`home`, its **owning planner** (`owner`), and its initial assignment from
`assignmentSeed` — the one moment spawn writes creep memory; thereafter only the owner
does (§6). Handles the bootstrap case (no creeps alive → smallest viable worker wins
regardless of ideal bodies) and pre-spawning replacements before lifetime expiry so
throughput never gaps. Demands carry `home`, so a healthy room servicing a struggling
neighbor's demand (§5.14) needs no contract change. Queue and pre-spawn state persist in
the spawn slice (§6).

### 5.7 Layout (`src/layout/`) — class C

Hands-off base planning. Pure function: terrain + sources + controller + mineral +
**existing structures** → `BasePlan` placing **all structures through RCL8** (including
terminal, labs, factory, nuker, extractor — endgame homes reserved on day one). Computed
once per room when no valid plan exists, stored in the room's memory slice, versioned.
The plan **anchors to reality**: a manually placed first spawn (respawn case), a
pre-existing base (`growth`/`full-base` scenarios, adopted rooms) — existing structures
are inputs, and the plan **incorporates** them (anchor on the spawn, adopt built
structures as the head of their type's placement array, plan around occupied tiles);
demolition of badly-placed structures is an explicit later-milestone decision.
Plan-vs-reality reconciliation is part of this subsystem's spec, not an afterthought.
The `BasePlan` is deliberately **unordered placement data**.

### 5.8 Construction (`src/construction/`) — class C

**Build order is its own subsystem.** It turns the `BasePlan` into a sequenced build
queue (derived fresh each run — §6) and places only a **small number of construction
sites at a time**, in structure-priority order. Rationale: a half-built structure is
worth nothing until it completes, so concentrating builders on one extension beats
spreading them across that extension plus 20 road sites — the extension pays back (more
spawn energy) immediately. Priority is by economic/defensive impact per RCL
(spawn > extensions > containers > towers > storage > … > roads — exact ordering and
concurrent-site count specced in its design doc). Economy fields a fixed small builder
crew while sites are open (5.5); few-sites-at-a-time concentrates that crew's labor on
one structure — the workforce *pull* is capped by economy's builder count, not by the
site count.

### 5.9 Defense (`src/defense/`) — class A (towers/assessment) + B (response)

Per-room threat assessment from snapshot + intel: a `ThreatLevel` enum (none / nuisance /
raid / siege) derived from hostile composition, not raw counts, filtered through the
diplomacy config (§7 — allies are not threats). Response ladder by level: towers fire
(always, class A) → spawn defenders via spawn demand → close ramparts (when they exist) →
**request safe mode from empire** (§5.14 — safe mode is shard-global, so per-room defense
requests and empire arbitrates; trigger conditions explicitly privilege spawn survival,
since an RCL1–6 room has exactly one spawn and pre-M6 no neighbor can rebuild it). Also
consumes threat flags raised by remotes (5.10) to pull miners home and stage defenders,
and owns the response to **invader cores** in remotes: a core blocks reservation and
harvesting until destroyed, so defense either fields a core-killer or explicitly writes
the remote off — a decision, not a default.

**Fortification is defense's ongoing job, not just wartime.** Which tiles get ramparts is
layout's decision (in the BasePlan) and first construction goes through the construction
manager, but defense owns the **target HP policy**: covering decay upkeep and
progressively raising rampart/wall HP toward a target scaled by RCL and the observed
threat environment. It publishes `fortificationTargets(room)`; economy consumes them as
repair work like any other (5.5). Fortification energy competes with upgrading and
construction, so the target policy and its budget share are explicit in the defense
design doc, not emergent.

### 5.10 Remotes (`src/remotes/`) — class B/C

Per home room: adopt profitable neighbors from intel scores (source-keeper and highway
rooms excluded by room type), mine sources, haul home. Produces spawn demand and
assignments through the same contracts as the home economy (a remote miner's assignment
looks like a home miner's, with a room field). Reacts to invaders by flagging the remote
unsafe (via intel's accessor), retreating creeps, and letting defense decide whether to
contest; reports invader-core sightings the same way.

Two **separately computed** economic decisions per remote, never assumed:

1. **Adopt at all?** Income minus body upkeep, haul distance, *and standing
   infrastructure upkeep* (remote containers and roads decay too), from real constants.
2. **Reserve or not?** Reserving doubles source capacity (1500 → 3000 per regen).
   Engine-verified correction (M5 review — intents resolve before controller ticks):
   a **1-CLAIM creep sustains a reservation indefinitely**, so `[CLAIM, MOVE]` = 650
   energy is the *functional* floor; **2×CLAIM + 2×MOVE (1300)** is the *slack* body
   — it builds the timer +1/tick so missed ticks don't drop the reservation, where
   1-CLAIM tolerates exactly zero. Both are continuously replaced (600-tick
   CLAIM-creep lifetime, spawn and travel gaps included). Mine-
   unreserved is a valid steady state — the default for low-RCL homes, distant remotes,
   and 1-source rooms; the break-even formula lives in the remotes design doc. The
   decision is re-evaluated as the home room grows, and each remote's state (unreserved /
   reserved) is explicit in its memory slice.

### 5.11 Creep execution (`src/creeps/`) — class A

The thin doing-layer: for each creep, read its assignment, run the small state machine for
that assignment kind (e.g. mine: move to seat, harvest; haul: pickup at A, deliver to B),
emitting intents and movement requests. No decisions beyond micro-execution, and **no
writes to assignments**: executors return a per-creep result (`ok / invalid / blocked`)
consumed in-tick by telemetry; owning planners detect invalid assignments themselves by
revalidating against the snapshot on their next planning pass (a creep with a dead target
idles for at most a planning interval). Every assignment kind's executor is a pure
function over (creepView, assignment, snapshot) returning intents — unit-testable.

### 5.12 Movement (`src/movement/`) — class A

The shared path service and single PathFinder call site: cached paths and cost matrices,
`requestMove(creep, target, opts)` collected during creep execution, then one resolution
pass at tick end handling traffic (swap/shove for stuck creeps, priority creeps win).
Class A cannot be shed by the scheduler, so movement **bounds itself**: per-tick pathfind
budget, `maxOps` caps per search, path-reuse windows, and deferral of non-urgent repaths
to later ticks are part of its contract, not tuning afterthoughts. The biggest CPU hot
spot in any bot, so it is also the most instrumented.

### 5.13 Expansion (`src/expansion/`) — class C

Empire-level: scores candidate rooms from intel (sources, mineral, terrain, distance,
neighbors; source-keeper/highway rooms excluded), and when GCL and CPU headroom allow,
picks a claim target, spawns claimer + pioneers from a sponsor room, and runs the
bootstrap until the new room's own economy is self-sufficient (first spawn built).
Explicit CPU-headroom gate: expansion never pushes average CPU above ~80% of limit —
consistent with the §9 budget, which reserves that headroom. Persistent state (claim in
progress, pioneer roster) lives in its own slice (§6), not empire's.

### 5.14 Empire (`src/empire/`) — class C

Deliberately thin: the registry of owned rooms and their lifecycle state (bootstrapping /
stable / crippled), the trigger for expansion, brokerage of cross-room aid (a crippled
room's spawn demand is offered to a healthy neighbor's resolver — the demand's `home`
field already supports this), and **safe-mode arbitration**: only one room per shard can
be in safe mode at a time and activations are scarce, so defense requests (5.9) and
empire grants — trivially, while we own one room; by policy, when we own several. This is
where terminal logistics and market plug in later (§7). If this file gets big, we're
doing it wrong.

### 5.15 Telemetry (`src/telemetry/`) — class A (core) + C (extended)

The **core is class A and cheap by construction**: CPU per scheduled entry, bucket,
skipped-entry marks, per-creep-execution result counts, global-reset counter, uncaught
error counter. If it ever sheds, we lose exactly the evidence that explains the shedding
— so it must not shed, and its own cost is bounded by design (counters, not scans).
Extended stats (per-room energy income/spend, spawn uptime, creep counts by assignment
kind) flush on an interval (class C) into a size-bounded `Memory.stats` ring. Log levels
with a global switch; hot paths log nothing by default. **Alerting is telemetry's job**:
`Game.notify` on room-lost, safe-mode-fired, error-rate, and CPU-ceiling events — this is
how a bot judged on "runs a week unattended" (§2) tells us it needs attention.

## 6. Memory Ownership Map

Ambient `Memory`/`CreepMemory` interface extensions are declared in `src/main.ts`
(per repo convention); each slice's **schema** has exactly one owning subsystem, all
writes flow through the owner's module, and owners may expose narrow write accessors
(principle 4). Memory is JSON-parsed every tick and that cost is ours (§9), so every
slice also gets a **size budget** in its subsystem doc; intel and stats are the growth
risks and move to RawMemory segments when they approach theirs (§7).

| Slice                          | Owner        | Notes |
| ------------------------------ | ------------ | ----- |
| `Memory.version`               | shell        | schema version; migrations + world-discontinuity resets run at bootstrap |
| `Memory.shell`                 | shell        | persisted owned-room tracking (`owned`, `lostAt`) driving room-loss/respawn detection and lost-room GC — persisted because heap dies on reset |
| `Memory.rooms[name].econ`      | economy      | static seats/spots (upgrade spot, source spots). The workforce plan itself is derived fresh each tick and never persisted — legibility comes from per-creep assignments in CreepMemory |
| `Memory.rooms[name].layout`    | layout       | BasePlan, versioned |
| `Memory.rooms[name].build`     | construction | reserved (versioned, empty) — the build queue is derived fresh each run from plan + snapshot, not persisted (construction.md) |
| `Memory.rooms[name].spawn`     | spawn        | queue + pre-spawn state |
| `Memory.rooms[name].defense`   | defense      | threat state only (`{v, level, lastHostile?}`) — fortification targets and safe-mode requests are derived fresh each run, not persisted (defense.md) |
| `Memory.rooms[name].remotes`   | remotes      | adopted rooms + per-remote state (reserved/unreserved, unsafe) |
| `Memory.intel[name]`           | intel        | persistent room knowledge, `lastSeen` everywhere; accessor-mediated writes |
| `Memory.empire`                | empire       | room registry + lifecycle (`{state, since}`), last safe-mode grant |
| `Memory.expansion`             | expansion    | the one claim in flight (target, sponsor, phase, claimer name for death observation) + cooldown; the pioneer roster is derived from creep memory, not persisted |
| `Memory.stats`                 | telemetry    | bounded ring buffer |
| `CreepMemory.home`             | spawn        | set at spawn time (or once, by the adopting owner for orphan creeps — economy.md); never changes after |
| `CreepMemory.owner`            | spawn → owner| owning planner id; stamped at spawn from demand; changes only by explicit handoff (release by owner, claim by successor — both recorded) |
| `CreepMemory.assignment`       | owning planner | exactly one writer at any time: the planner named in `owner`. Creep execution reads, never writes (invalid assignments are detected by the owner's revalidation, §5.11) |

Rules: no subsystem reads another's slice except through the owner's exported accessors;
the `owner` field is the arbitration rule for creeps — defense wanting an economy hauler
is an ownership *handoff request*, not a competing write.

## 7. Endgame & Extension Seams (planned for, not specced)

1. **Resource-typed schemas.** Anything storing amounts is keyed by resource type
   (`Partial<Record<ResourceConstant, number>>`) even while only energy flows. Each room
   economy exposes a **ledger** (surplus/deficit by resource) in its contract.
2. **Empire resource layer.** Terminals/market/factories arrive as a new empire-level
   class-C subsystem that reads room ledgers and moves surpluses. Rooms never learn the
   market exists.
3. **Layout reserves endgame structures.** Labs/terminal/factory/nuker/extractor positions
   exist in every BasePlan from day one (5.7); economy grows a mineral-mining assignment
   kind at RCL6 to feed them.
4. **`boosts?` on spawn demand** (5.6), ignored until labs exist.
5. **Scheduler entries are data**, so new subsystems (market, labs, power) are new entries,
   not restructuring.
6. **Diplomacy config.** A whitelist/ally list consumed by defense's threat assessment,
   tower targeting, and rampart policy. One config object now; painful to retrofit later.
   Default stance: everyone is hostile.
7. **RawMemory segments** for intel and stats overflow: 10× more storage, parsed only when
   requested — the pressure valve for the per-tick Memory parse cost (§9).
8. **Offense** will consume defense's threat model and the movement service, and produce
   spawn demand like everyone else; it gets a `SubsystemId` reserved and nothing else.

## 8. Build Order

Each milestone = design doc(s) → unit tests → sim assertions, then the next. Sim scenarios
already exist for each stage. **Degraded-input contracts make this order executable**:
every intel consumer tolerates empty intel (§5.4), economy runs without a BasePlan
(pre-M3: no construction, containers optional), and defense runs without intel history
(assess from snapshot only). Those degraded modes are part of each subsystem's spec, not
temporary hacks.

| Milestone | Builds | Proves (sim) |
| --------- | ------ | ------------ |
| M1 Skeleton | shell, scheduler, snapshot, telemetry core | smoke: ticks clean, CPU measured |
| M2 One room lives | economy (no layout yet), spawn, creep execution, basic movement | `default`: RCL2 + sustained pre-container economy (decay physics cap the era at ~5–7 e/t of upgrade — economy.md) |
| M3 Hands-off building | layout + construction | `growth`: plan-anchoring around a pre-existing spawn (§5.7); `default`: extensions + containers built hands-off, upgrade rate steps up (RCL3's 45k progress exceeds the invader-safe sim window at 20 e/t income — the gate proves the rate that makes RCL3 inevitable, construction.md) |
| M4 Durability | defense, movement traffic/caching, wipe + discontinuity recovery | `under-attack`, `wiped-base` |
| M5 Reach | intel (with scouting), remotes, links | `remote-mining` (sight → adopt → reserve → mine home), `remote-invader` (pause/resume), `links` (a route carried with zero hauler labor) |
| M6 Empire | expansion, empire (registry, aid, safe-mode arbitration) | `expand`: fast gate claims a second room; full gate follows the arc to that room spawning its own creep. The 7-day MMO run (§2) stays a deployment checklist, not a sim gate |

## 9. CPU Budget (20 CPU, official MMO)

Design targets the scheduler and planners enforce (principle 8) and telemetry reports
against:

| Consumer | Budget (avg) |
| -------- | ------------ |
| Memory parse (JSON, every tick — scales with Memory size; slices have size budgets, §6) | ≤ 1 |
| Shell + snapshot + scheduler + telemetry core | ≤ 2 |
| Per owned room, all-in (economy, spawn, defense, construction, **its creeps' intents**) | ≤ 2.5 |
| Per room's remotes, all-in (all of them together, incl. creep intents) | ≤ 1.5 |
| Empire + expansion + intel refresh + scouting (throttled, amortized) | ≤ 1 |

Intent cost is the dominant per-creep term (flat 0.2 CPU per intent; a move+action creep
averages ~0.3–0.4/tick), which is why per-room budgets are all-in and why planners size
workforces to a CPU allowance rather than to energy alone (§3 principle 8, §5.5).

At 20 CPU: 1 + 2 + 3×(2.5 + 1.5) + 1 = **16 CPU for 3 owned rooms + their remotes — 20%
headroom**, consistent with expansion's ≤80% gate (§5.13). The fourth room waits for CPU
subscription (limit then scales with GCL), not for optimism. Movement cost lands inside
the per-room all-in numbers but is instrumented separately (§5.12). If telemetry shows a
room exceeding budget, that is a bug by definition, not a tuning opportunity.

## 10. Testing the Architecture Itself

- Every subsystem's pure core: mocha unit tests (`npm run test`), no Screeps globals.
- Every milestone: a sim assertion suite (`bin/sim test`) on the matching scenario.
- The comprehensibility goal gets tested too: each subsystem doc goes through a
  fresh-context review (can a cold reader restate the contract and reimplement?) before
  its implementation starts — per the repo's design-first process.
