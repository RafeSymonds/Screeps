# Spawn Design

Status: draft — M2, revised after fresh-context review
Parent: [architecture.md](architecture.md) §5.6 (also §4 "per-tick reactive spawning" rejection).

## Goal

Turn per-tick spawn demand into spawn intents: highest-priority gap first, bodies scaled
by the demander, bootstrap handled explicitly. Success criteria:

- A fresh room spawns its first working creep immediately, and a wiped room recovers
  from any energy level via minBody demands — no 500-tick trickle stalls.
- No duplicate spawns: spawning and pre-spawn-aged creeps count as filling their slots
  (economy.md), and the resolver services each demand id at most once per tick.
- The resolver is a pure function over (demands, room state) with exhaustive unit tests.

## Interface

```ts
// src/shared/spawning.ts — cross-subsystem: economy (later defense/remotes/expansion)
// produce demands; spawn consumes them; TickContext carries them.
export interface SpawnDemand {
    /** Stable key for the gap, e.g. "mine:W1N1:src1:2" — the resolver's in-tick
     *  serviced-set key, and M6's cross-room dedupe key. */
    id: string;
    priority: number;                  // lower = more urgent (tiers in economy.md)
    home: string;                      // room whose spawns service this
    owner: SubsystemId;                // → CreepMemory.owner
    assignment: Assignment;            // → CreepMemory.assignment (the seed)
    body: BodyPartConstant[];          // ideal body for current energyCapacityAvailable
    /** Present ⟺ the producer declares this role income-dead (economy.md's per-role
     *  bootstrap rule). The resolver may fall back to it. No other emergency signal exists. */
    minBody?: BodyPartConstant[];
    boosts?: never;                    // reserved seam (architecture §7)
}

// TickContext (src/shared/tick.ts) gains:
//   spawnDemands: SpawnDemand[]      // fresh [] built by the shell each tick; producers push

// src/spawn/resolver.ts — the pure core
export interface SpawnDecision {
    spawnId: Id<StructureSpawn>;
    demand: SpawnDemand;
    body: BodyPartConstant[];          // demand.body or demand.minBody
    name: string;
}
export function resolveSpawns(demands: SpawnDemand[], room: RoomSnapshot, time: number): SpawnDecision[];

// src/spawn/index.ts — the class-B perRoom entry: filters ctx.spawnDemands by home,
// calls resolveSpawns, executes spawnCreep(body, name, { memory: { home, owner,
// assignment } }) — the one moment spawn writes creep memory. Free spawns come from the
// snapshot: StructureView.spawning (the M2 view extension, snapshot.md).
```

## Resolution policy

1. Sort by `priority` (stable sort — emission order breaks ties, which is how
   economy.md's in-tier ordering arrives).
2. Track `remainingEnergy` (starts at `room.energyAvailable`) and a serviced-id set.
   For each **free** spawn (`StructureView` of type spawn with `spawning !== true`),
   take the highest-priority unserviced demand:
   - `remainingEnergy ≥ cost(body)` → spawn `body`, deduct.
   - else if `minBody` present and `remainingEnergy ≥ cost(minBody)` → spawn `minBody`,
     deduct — the bootstrap fallback, available exactly when the producer attached it.
   - else **stop entirely** — head-of-line blocking is deliberate: nothing cheaper jumps
     the queue, so energy accumulates toward the important body instead of leaking into
     lower-priority spawns.
3. A body over 50 parts or over `energyCapacityAvailable` is refused **and blocks** like
   an unaffordable one (defense in depth — the producer made an error; starving loudly
   beats spawning wrong, and telemetry's spawn-error path catches the repeat).
4. Names: `{kind}_{home}_{time}` (+`_{n}` when one tick spawns several of a kind) —
   unique across rooms and readable in any creep list.

Nothing persists: demand is recomputed by producers every tick (architecture §4),
spawning creeps appear in the snapshot roster, pre-spawn aging (economy.md) handles
replacement timing. The `Memory.rooms[name].spawn` slice from architecture §6 stays
**reserved but empty** at M2 — if multi-spawn scheduling later needs state, it lands
there with a doc update.

**Load-bearing game mechanic** (verified in sim; absent from the local API mirror): a
spawn regenerates its own store at 1 e/t up to 300 while room energy is below capacity.
This is the recovery path for a drained wipe: minBody `[C,M]` (100) is reachable in
~100 ticks from zero. If sim ever shows otherwise, this doc and economy.md's bootstrap
timelines are the things to fix.

### Head-of-line blocking is TIME-BOUNDED (M6, sim-caught twice)

Holding the queue for an unaffordable head demand is **load-bearing**: it is how a
room saves up for a body it cannot afford this tick instead of dribbling its income
away on cheap ones. Sim evidence: an `infra-built` room whose only "haulers" were
adopted 1-CARRY generalists recovers *only* by accumulating toward a real one — a
resolver that always let cheaper work through left it deadlocked with zero haulers,
spawn-side energy pinned near 100, and controller progress frozen dead.

But an **unbounded** hold is starvation: a room whose income never reaches its own
ideal body spawns nothing behind that demand, ever. Same sim, other scenario: an RCL5
sponsor hovering around 800 energy sat behind its own 1800-energy hauler demand and
never built a 650-energy claimer, so expansion recorded a claim it could not act on
for an entire run.

So the hold is bounded in **time**, not in energy: the resolver records which demand
it is waiting on and since when (`Memory.rooms[name].spawn` — the one piece of spawn
state that cannot be re-derived), holds for up to `BLOCK_PATIENCE` (150 ticks), then
lets the queue through **once** and clears the record. At most one queue-jump per
patience window; never a permanent skip, so a demand the room is genuinely saving
for still gets built. Malformed or over-capacity bodies still block absolutely
(defence in depth), and `minBody` is still tried first.

## Memory Schema

None at M2. Spawn's only Memory write is the newborn's
`CreepMemory = { home, owner, assignment }` via the `spawnCreep` memory option.

## Tick Flow

Class B, perRoom, after economy in the normative order (same tick: economy pushes,
spawn consumes — no cross-tick queue). Shed under CPU pressure → spawning pauses one
tick; demand reappears by recomputation.

## Edge Cases

- **No demands / all spawns busy / nothing affordable**: no-op; energy accumulates
  toward the head of the line.
- **Drained below every minBody** (energy < 100): wait on the 1 e/t self-regen —
  slow by design; M4 hardens wipe recovery.
- **Two free spawns, one energy pool**: `remainingEnergy` deduction is why the second
  decision can't overdraw (the two-spawn unit test covers depletion: 300 energy, two
  250-cost demands → one spawn).
- **spawnCreep returns an error despite the resolver's math** (intent race, name
  collision): log at Warn, recompute next tick; repeats surface as telemetry
  ErrorBurst.
- **Foreign `home` demands** (M6 cross-room aid): filtered out today; `home` is already
  the routing key, so M6 changes the filter, not the type.

## Test Plan

Unit (pure resolver):

- Priority + stability: order preserved within a tier; unaffordable head blocks
  affordable tails.
- minBody: used exactly when present and ideal unaffordable; absent → resolver waits.
- Two free spawns: both service in order; energy depletion caps the second; busy spawns
  skipped; zero spawns → zero decisions.
- Refusal: >50 parts or > capacity blocks the line.
- Stamping: decision carries assignment/owner/home unchanged; names embed kind + home +
  time and dedupe with `_n`.

Sim: the M2 gate (economy.md) — generational continuity (creep count floor after t800)
is the spawn pipeline's assertion.
