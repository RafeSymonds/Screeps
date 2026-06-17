# Spawn Request Contract

`SpawnManager` produces creeps from two demand sources, merged each tick:

1. **Economy job demand** — aggregated from open `JobBoard` slots vs live labor (`src/spawn/demand.ts`).
2. **Controller `SpawnRequest`s** — explicit asks from defense/combat/expansion via the
   `SpawnRequestQueue` (`src/spawn/queue.ts`).

Controller requests always outrank economy demand. A population **floor** sits under both so a wiped
room can never collapse.

## What a `spawnRole` is (and is not)

`SpawnRole` (`src/spawn/types.ts`: `generalist | miner | hauler | worker | defender | claimer |
soldier`) is a **spawn-side tag only**. It answers two questions:

1. Which body template to build (`buildBody` in `src/spawn/bodies.ts`).
2. How many of that template to keep alive (population counting in `SpawnManager.chooseRole`).

It is **not** a behavioral role. Once a creep is alive, what it does is decided by capability-based
matching (`src/matching/capability.ts`): any economy creep performs any job its body can satisfy. A
`worker` is not pinned to building; it simply has a body suited to general work.

Population is counted from the persisted `CreepMemory.spawnRole` tag written at spawn time — not by
inspecting body parts — because several roles can share a body shape.

## The `SpawnRequest` contract

```ts
interface SpawnRequest {
    key: string;       // stable key so a subsystem avoids duplicate requests across ticks
    roomName: string;
    role: SpawnRole;
    priority: number;  // higher wins; controller requests outrank economy demand
    body?: BodyPartConstant[];  // optional explicit body; else SpawnManager sizes one
    owner?: string;    // controller tag -> written to CreepMemory.controller (skips the matcher)
}
```

- **`owner` is the hybrid-command switch.** A creep spawned with `owner` set carries
  `CreepMemory.controller` and is commanded imperatively by that subsystem in the tactical phase
  (`src/controllers/index.ts`); the matcher skips it. Economy creeps leave `owner` undefined and flow
  to job matching.
- **Priority ordering.** `SpawnManager` drains `queue.forRoom(roomName)` highest-priority first and
  spawns the top affordable request before considering economy demand.
- **Affordability.** A request is only spawned when `bodyCost(body) <= room.energyAvailable`.

## Priority guidance

| Tier | Range | Use |
| :--- | :--- | :--- |
| Emergency | 220+ | Critical defense, must-spawn-now |
| Critical | 180–219 | First defender, high-pressure recovery |
| Normal | 90–139 | Expansion claimers, typical controller asks |
| Low | < 90 | Opportunistic / optional |

Economy demand effectively sits below controller requests (it is only consulted when the queue is
empty for that room), with the generalist floor as the hard backstop.

## Economy demand + floor (no SpawnRequest needed)

Economy creeps are **not** requested via `SpawnRequest`. `SpawnManager.decideEconomy`:

1. **Floor** — if a room has zero creeps or no creep with WORK, spawn a generalist immediately using
   whatever energy is on hand.
2. **Demand** — compare `JobBoard.demand(roomName)` (open slots × per-slot demand) to `laborSupply`
   (live WORK/CARRY parts). Spawn only while demand exceeds supply; as the matcher fills slots, demand
   falls and spawning self-limits.
3. **Role** — stay on cheap generalists until the room can afford specialists and has source
   containers, then fill miners/haulers.

## Adding a controller subsystem

Post `SpawnRequest`s from the subsystem's `plan*` function (returned to the kernel, pushed onto the
queue), give them an `owner` prefix (e.g. `combat:`, `expansion:`), and command the resulting creeps in
`commandControllerCreeps` (`src/controllers/index.ts`). No change to `SpawnManager` is required.
