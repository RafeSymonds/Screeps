# Spawn Request Contract

This document defines the shared contract for requesting spawns via `RoomMemory.spawnRequests`. It ensures that baseline economic logic and high-level strategic plans can coexist without unintentional interference.

## What a "role" is (and is not)

A `SpawnRequestRole` (`miner`, `hauler`, `hubHauler`, `fastFiller`, `mineralHarvester`, `maintainer`, `worker`, `scout`, `defender`, `attacker`, `reserver`) is a **spawn-side concept only**. It answers two questions for `SpawnManager`:

1. **Which body template to build** (`minerBody`, `maintainerBody`, …).
2. **How many of that template to keep alive** (the population target a request expresses via `desiredCreeps`).

It is **not** a behavioral role. Once a creep is alive, what it does is decided entirely by capability-based task assignment (`TaskAssignment`): any creep performs any task its body can satisfy. A `maintainer` is not pinned to repair, a `mineralHarvester` is not pinned to the extractor — they simply have bodies suited to that work and a population target sized for it.

### How role population is counted

`SpawnManager` counts existing creeps per role from the **persisted `CreepMemory.spawnRole` tag** written at spawn time — *not* by inspecting body parts. This is mandatory because several roles share identical bodies:

| Body | Roles that share it |
| :--- | :--- |
| `[CARRY, MOVE]×n` | `hauler`, `hubHauler`, `fastFiller` |
| `[WORK, CARRY, MOVE]×n` | `worker`, `mineralHarvester` |

Body-shape classification cannot tell these apart, so demand for the specialized roles would be silently satisfied by the wrong creeps (e.g. a `mineralHarvester` request "met" by an unrelated worker). The tag is treated as stable identity and is preserved across task resets (`getDefaultCreepMemory`). Legacy creeps without a tag fall back to a body-shape heuristic (`bodyFallbackRole`) until they cycle out.

**If you add a new role:** add a `SupplyTotals` field + an `incoming*` field, populate it in the `deriveSupply` count loop, add it to `currentCreepsForRole`, `roleFromIntent`, and `incrementIncomingForRole`. Counting and demand must reference the same dedicated bucket or the role will over- or under-spawn.

## Core Mechanism

- **Absolute Targets**: Each request specifies a `desiredCreeps` target for a specific `SpawnRequestRole` in a `room`.
- **Global Visibility**: `SpawnManager` subtracts *all* creeps of the requested role (including those spawning or in transit) from the target. Requests are *not* additive.
- **Priority Selection**: In each tick, the `SpawnManager` sorts all active requests and attempts to satisfy the one with the highest `priority` that still has `unmetCreeps > 0`.
- **Coexistence**: If two plans request the same role (e.g., `baseline` wants 3 workers, `bootstrap` wants 2), they compete. If 2 workers exist, `bootstrap` is satisfied, but `baseline` will still try to spawn 1 more (at its own priority).

## Priority Ranges

To maintain system stability, use the following priority tiers:

| Tier | Range | Use Case |
| :--- | :--- | :--- |
| **EMERGENCY** | 220+ | Critical bootstrap (0 energy), emergency defense. |
| **CRITICAL** | 180-219 | First miner/hauler in a room, high-pressure recovery. |
| **HIGH** | 140-179 | Cross-room Support/Bootstrap, high-pressure economy. |
| **NORMAL** | 90-139 | Expansion (Claim), Reservation, Scouting, typical labor. |
| **LOW** | 50-89 | Secondary builders, surplus haulers, optimization. |
| **IDLE** | < 50 | Opportunistic or low-value tasks. |

## Naming Conventions (`requestedBy`)

To avoid collisions and ensure proper cleanup, use the following prefixes:

- `baseline:${role}:${roomName}`: Reserved for `SpawnManager`'s internal task-based demand.
- `plan:${planName}:${identifier}`: For long-running strategic intents (e.g., `plan:expansion:E1N1`).
- `task:${taskId}`: For specific, short-lived tasks that need dedicated labor.
- `support:${targetRoom}`: For cross-room assistance requests.

## Expiry Guidance (`expiresAt`)

- **Baseline**: `Game.time + 2` (refreshed every tick).
- **Plan/Task**: `Game.time + (PlanInterval * 2)`. If a plan runs every 10 ticks, an expiry of 20-30 ticks is recommended.
- **Safety**: Requests automatically expire to prevent "ghost demand" if a plan is disabled or crashes.

## Usage Patterns

### The "Adapter" Recommendation

Do **not** modify `room.memory.spawnRequests` directly. Use the helpers in `src/spawner/SpawnRequests.ts`:

1.  `upsertSpawnRequest(room, request)`: The standard entry point.
2.  `clearSpawnRequest(room, role, requestedBy)`: Explicitly remove a request when no longer needed.

Plans should prefer a standardized priority constant from the Tier table above.

### Cross-Room Requests

When a plan in Room A wants to spawn a creep in Room B (Helper), it should:
1.  Check if Room B is "healthy" (e.g., `roomCanHelp`).
2.  Write the request to `Game.rooms[B].memory.spawnRequests`.
3.  Ensure the `requestedBy` key includes Room A's name to avoid collisions if multiple rooms are being helped.
