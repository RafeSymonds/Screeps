# Energy-Flow-Driven Spawning

Authoritative design for how a room decides **what to spawn**. Companion to
[MODULAR_ARCHITECTURE.md](MODULAR_ARCHITECTURE.md). Implemented in
[`src/economy/EnergyModel.ts`](../../src/economy/EnergyModel.ts) (model) and
[`src/spawn/SpawnManager.ts`](../../src/spawn/SpawnManager.ts) (actuator); tunables in
[`src/config/constants.ts`](../../src/config/constants.ts) (`ECONOMY_*`, `MINER_WORK_PER_SOURCE`).

## Principle

**Population is an output, not an input.** The bot does not assert "1 miner per source, 2 haulers, N
workers". It models each room as an energy flow and spawns whatever the flow is most starved of. The
objective: *mine as much as the sources allow, move it before it backs up, and consume 100% of it —
critical needs first, then construction, then upgrade as the elastic sink, with storage as a buffer.*

This replaced a hardcoded composition ladder (`haulers < sources+1`, fixed flex count) whose hauler
count ignored the one variable that actually drives it — distance — and whose demand was `open job
slots × a constant`, a number unrelated to real energy throughput.

## The flow: three stages

The room is a pipeline. Each stage has a **target** (body parts needed) and a **supply** (parts alive).

| Stage | Output | Target | Why |
|---|---|---|---|
| **Income** | miner `WORK` | `5 × sources` | A source regens `SOURCE_ENERGY_CAPACITY/ENERGY_REGEN_TIME = 10 e/tick`; `HARVEST_POWER` is 2, so **5 WORK fully drains it**. Income has a hard ceiling — more WORK mines nothing. |
| **Logistics** | hauler `CARRY` | `Σ income·tripFactor·dist / CARRY_CAPACITY`, scaled by mining saturation, plus a backlog bump | A hauler delivers `~50·CARRY/(tripFactor·dist)` e/tick, so the CARRY needed scales with income **and source→sink distance** — which is exactly why a fixed hauler *count* is wrong. |
| **Consumption** | consumer `WORK` (build/upgrade) | elastic — sized to burn the surplus, gated by the storage band | Spawn/extension/tower refill and construction are bounded. **Upgrade is the infinite sink**, so consumers are the free variable that absorbs whatever income remains. |

`roomDemand(worldRoom, world)` computes all three from measured state each tick.

### Income

`income = min(minerWorkSupply × HARVEST_POWER, sources × 10)` — *measured* (capped at regen), not
aspirational, so downstream targets track what is actually being mined.

### Logistics — distance-aware + backlog-corrected

The analytical target sizes CARRY to ferry the income over each source→sink (storage, else spawn)
distance, scaled by how saturated mining currently is (`income / ceiling`). It is then **corrected by a
measured signal**: `WorldRoom.backlogEnergy()` = dropped energy + mining-container fill. A backlog above
`ECONOMY_BACKLOG_THRESHOLD` means income is outrunning carry, so a flat `ECONOMY_BACKLOG_CARRY_BONUS` is
added. This is the same undelivered-energy pool the logistics *executor* scores over (see
[`src/actions/logistics.ts`](../../src/actions/logistics.ts)) — model and execution share one signal.

> v1 uses Chebyshev `getRangeTo` as a cheap distance proxy (O(1), no PathFinder). True path distance
> with caching in `RoomMemory.economy` is the documented upgrade.

### Consumption — the elastic sink + storage band

Consumer WORK is sized to burn the surplus, gated by where storage sits in its band:

| Storage (smoothed) | Band factor | Behavior |
|---|---|---|
| no storage yet (RCL < 4) | `1.0` | nowhere to bank — overflow decays, so consume it all (upgrade) |
| `< ECONOMY_STORAGE_FLOOR` | `0` | emergency reserve — hoard (a min floor still upgrades 1 WORK so the controller never downgrades) |
| `floor … target` | `0.5` | build the buffer, upgrade modestly |
| `≥ ECONOMY_STORAGE_TARGET`, trend ≥ 0 | `1.0` | genuine surplus — spend it all on upgrade |
| `≥ target`, trend < 0 | `0.5` | draining — ease off |

`consumerWork = clamp(surplus / (UPGRADE_CONTROLLER_POWER × CONSUMER_EFFICIENCY),
ECONOMY_MIN_CONSUMER_WORK, ECONOMY_MAX_CONSUMER_WORK)`. The cap means a rich room stops growing
upgraders and lets the surplus overflow into storage — which is correct, **storage is the buffer**.
"Saving counts as using, but we can't only save": below the floor we hoard, above the target we must
spend.

**Storage is the integrator.** `senseEconomy(world)` runs every tick (cheap, O(1)/room) and maintains an
EMA of the storage level and its per-tick trend in `RoomMemory.economy`. Acting on the *smoothed* level
and trend — not the instantaneous value — is what keeps the controller from oscillating against the
spawn-cycle sawtooth. The EMA tolerates throttled/skipped ticks via the elapsed-tick delta.

## The scheduler: largest deficit wins

`pickDeficitRole(demand)` returns the stage with the largest positive deficit ratio
`(target − supply)/target`, or `null` when all are met (the room is staffed; surplus banks into
storage). Ties break toward upstream stages (mine → haul → spend) by listing order.

There is deliberately **no hard "income first" gate.** The hauler and consumer targets are themselves
income-derived, so when income is low their targets — and deficits — are small and the large miner
deficit wins naturally; as income rises, the downstream deficits grow and get funded. A hard parts-based
gate instead *starves* logistics and consumption whenever miners are energy-limited (a low-RCL miner
carries only ~2 WORK, so a `minerWork`-based gate never clears) — this was a real bug caught in sim.

`SpawnManager` maps the chosen stage to a body (`Miner`/`Hauler`/`Worker`), keeping the existing
**population floor** (a wiped or WORK-less room always gets a generalist) and the energy-capacity floor
(below `MIN_MINER_ENERGY` every gap is filled by a generalist, which serves all three stages).

## How supply is counted

`laborByKind` buckets live parts by the stage each body serves: miner `WORK`, hauler `CARRY`, worker
`WORK`. A **generalist** is the universal bootstrap body and counts toward all three. Role tags express
*intent* — the capability matcher then routes each body to matching jobs.

> **Known seam / limitation.** A `Worker` (WORK+CARRY) is *capability-eligible* for harvest/haul/upgrade/
> build, so the `Matcher` — not this model — decides what it actually does. When creeps are few (RCL1
> bootstrap), the least-staffed matcher can route every worker to harvest/haul and leave `upgrade`
> unstaffed, so the controller stalls (`up=0`) even though the model correctly *spawned* a consumer. The
> fix is to make the matcher honor flow intent, or to derive job capacities/priorities from the flow
> targets (**Phase E**, below). Dedicated bodies (miner = WORK-only, hauler = CARRY-only) self-route via
> the capability gate and don't have this problem.

## Pipeline integration

A single new step (`main.ts` step 6.5, `Phase.Economy`) calls `senseEconomy(world)` before spawning, so
the model always reads a fresh integrator. `SpawnManager` builds the demand model lazily per room. The
`Job`/`SpawnRequest` contracts and the rest of the pipeline are untouched.

## Memory

`RoomMemory.economy` (additive, optional — no migration needed):

```ts
interface EconomyMemory {
  storageEMA?: number;       // smoothed storage level (band gate)
  storageTrendEMA?: number;  // smoothed per-tick change (surplus/deficit sign)
  lastLevel?: number;        // last raw level, for the trend delta
  lastTick?: number;         // last sense() tick, for tick-delta-correct trend
}
```

Lazily initialized by `EnergyModel`; declared in the ambient `RoomMemory` interface in `src/main.ts`.

## Stability

- Storage **bands + EMA trend**, never instantaneous values.
- A **min consumer floor** keeps the controller from downgrading even while hoarding.
- A **max consumer cap** bounds upgrader growth (surplus then overflows to storage).
- The EMA is robust to the scheduler skipping ticks.

## Tuning knobs (`ECONOMY_*` in constants.ts)

`MINER_WORK_PER_SOURCE`, `ECONOMY_HAUL_TRIP_FACTOR`, `ECONOMY_BACKLOG_THRESHOLD`/`_CARRY_BONUS`,
`CONSUMER_EFFICIENCY`, `ECONOMY_MIN/MAX_CONSUMER_WORK`, `ECONOMY_STORAGE_FLOOR`/`_TARGET`,
`ECONOMY_EMA_ALPHA`. Open questions for sim tuning: road-correcting the trip factor; RCL-scaling the
storage band vs absolute energy; EMA window vs creep lifetime.

## Validated (bin/sim)

- **under-attack (RCL7):** flow-driven composition, `up` climbs, towers stay full, raiders cleared,
  storage stable — the full spawn → match → execute → upgrade chain works.
- **default (RCL1):** model spawns a correct income→logistics→consumption mix, but the controller
  stalls (`up=0`) due to the matcher seam above (pre-existing on `main`, not caused by this system).

## Future work

- **Phase E** — derive `Job` capacities/priorities from the flow targets, or make the matcher honor
  spawn intent, so consumers actually upgrade at low population (closes the bootstrap stall).
- **Reservation ledger** — the logistics executor's per-tick reservation map (see
  `src/actions/logistics.ts` future work) would feed exact unmet haul demand back into the backlog
  signal instead of the current snapshot.
- **True path distance** for the hauler target, cached in `RoomMemory.economy`.
- **Multi-room** — extend income/distance across remote-mined rooms.
