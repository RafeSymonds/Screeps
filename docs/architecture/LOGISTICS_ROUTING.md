# Logistics Routing — Coordinated Energy Assignment

How creeps decide **where to draw energy from and where to deliver it**, and how
they coordinate so the workforce spreads across targets instead of all chasing the
nearest pile. This is the *routing* layer; it sits **below** the Matcher (which
decides job kind / workforce shape) and the EnergyModel (which decides how many of
each creep to spawn). See [MODULAR_ARCHITECTURE](MODULAR_ARCHITECTURE.md) and
[ENERGY_FLOW_SPAWNING](ENERGY_FLOW_SPAWNING.md) for the layers around it.

Code: [`src/actions/logistics.ts`](../../src/actions/logistics.ts) (scoring +
sticky resolvers), [`src/actions/ledger.ts`](../../src/actions/ledger.ts)
(reservations). Tunables: `LOGISTICS_*` in
[`src/config/constants.ts`](../../src/config/constants.ts).

## The problem it solves

Each creep used to pick its source/sink by a private `argmax(value − distance)`,
blind to every other creep. Two failure modes followed:

1. **Amount barely counted.** The dropped-energy bonus was capped at +30 and
   containers/storage had no fill term, while distance cost 4/tile. So a 50-energy
   pile next door beat a 1500-energy stash five tiles away. Creeps chased trickles.
2. **No coordination → herding.** Every creep scored the nearest source highest,
   so they *all* went for it. It held enough for one; the rest arrived to nothing
   and stalled, while a large stash sat untouched.

The fix is two changes working together: **score by deliverable load**, and
**reserve what is already claimed** so others route around it.

## Model

- **Sources** (draw points): dropped piles, mining containers, storage — each has
  an `available` amount.
- **Sinks** (delivery points): spawn / extensions / towers — each has
  `freeCapacity`. (Controller-upgrade and build sites are *unbounded* consumers, so
  they are never reserved.)
- **Carriers** commit a **full load** (the agreed simplification): a gatherer
  reserves up to its free capacity from its source; a deliverer reserves up to its
  carried energy into its sink. Each reservation is capped by what the target can
  actually supply/accept.

## The reservation ledger

`LogisticsLedger` is an ephemeral per-tick map `targetId → reserved`. It is rebuilt
every tick by `buildLedger(world)`, which scans every live creep's committed target
(`srcTargetId` when gathering, `sinkTargetId` when delivering — the creep's phase is
its `working` flag) and sums the loads, capped by live availability. It holds **no
persistent state of its own** — self-healing across global resets, and a depleted or
vanished target simply contributes nothing.

```
remaining(S) = available(S) − ledger.reserved(S)   // for a NEW source picker
free(K)      = freeCapacity(K) − ledger.reserved(K) // for a NEW sink picker
ledger.claim(id, n)                                  // re-pickers add their claim live
```

Because the executors run sequentially, a creep that re-picks `claim()`s into the
live ledger, so the next creep that runs this tick already sees the target as taken.
That is the coordination — an incremental, greedy allocation, no global solver.

## Scoring (`pickEnergySource` / `pickEnergySink`)

Pure functions (creep + room + ledger → target), unit-testable without the engine:

```
source value = base[type] + deliverable · SOURCE_AMOUNT_WEIGHT − dist · DIST_WEIGHT
   deliverable = min(creep.freeCapacity, remaining(S))       // skip if ≤ 0
sink   value = base[type]·urgency + deposit · SINK_AMOUNT_WEIGHT − dist · DIST_WEIGHT
   deposit     = min(creep.load, free(K))                    // skip if ≤ 0
```

`deliverable`/`deposit` dominate: a source that can fill the creep beats a closer
trickle, and a fully-reserved target scores out entirely (≤ 0 → skipped). The
`base[type]` gap (dropped > container > storage) is now only a small decay-urgency
nudge. Sink base keeps the spawn > tower(under-attack) > extension ordering and the
fill-urgency / combat multiplier.

## Stickiness (`resolveEnergySource` / `resolveEnergySink`)

The executors call the **resolvers**, which add stickiness over the scorers:

1. If the creep holds a target that is still valid (object exists and has
   energy/space), **keep it** — the holder has first claim, so it revalidates on raw
   availability, never abandoning a source just because others queued behind it.
   (Its claim is already in the ledger from `buildLedger`; it is not re-counted.)
2. Otherwise drop the stale target, **re-pick** against `remaining`/`free`, persist
   the new id (`srcTargetId`/`sinkTargetId`), and `claim()` it into the ledger.

A creep re-picks only when its target is gone / empty / full, or its gather↔deliver
phase flips. This keeps churn and CPU low (no full argmax per creep per tick) and
stabilizes assignments.

## Where it plugs in

- Tick pipeline: `buildLedger(world)` runs in the tactical phase, then
  `runCreep(creep, board, world, ledger)` per creep.
- `runHaul`: gather via `resolveEnergySource` (storage gated on a real sink need to
  avoid reserve ping-pong), deliver via `resolveEnergySink`, then fall back to
  storage overflow / controller-drop.
- `runHarvest` (carrier-miner): delivers via `resolveEnergySink`.
- `acquireEnergy` (upgrade/build/repair gather): via `resolveEnergySource`, falling
  back to harvesting a source directly when nothing is staged.

## Memory

One pair of optional fields per creep: `CreepMemory.srcTargetId?` /
`sinkTargetId?`. Additive/optional → no migration (see
[MEMORY_MIGRATIONS](../qa/MEMORY_MIGRATIONS.md)). Reserved amounts are recomputed
each tick, never stored.

## Known approximations (intentional, self-correcting)

- **Full-load assumption** can slightly over-reserve a partly-drained source; it
  corrects on the next tick's rebuild.
- **One-tick phase lag**: a creep that flips gather↔deliver mid-tick was counted
  under its pre-flip phase by `buildLedger`; corrected next tick.
- **Greedy, not optimal**: assignment order affects ties. At per-room scale this is
  well within tolerance; a min-cost-flow optimizer is possible later if ever needed.

## Tests

- `test/unit/ledger.test.ts` — claim accumulation; `buildLedger` reservation sizing,
  capping, phase selection, and skips (gone target / spawning / untargeted).
- `test/unit/logistics.test.ts` — deliverable-dominates-distance, routing around a
  reserved source, sink spreading, storage gating, stickiness (keep / drop-and-
  re-pick), and end-to-end coordination of two creeps onto different sources.

## Extending

- Tune feel: `LOGISTICS_DIST_WEIGHT`, `LOGISTICS_SOURCE_AMOUNT_WEIGHT`,
  `LOGISTICS_SINK_AMOUNT_WEIGHT`, the `*_SOURCE_*` / `*_SINK_*` bases.
- Add a source/sink type: extend the scorer loops and `heldSource`/`heldSink`
  revalidation in `logistics.ts`; the ledger needs no change.
