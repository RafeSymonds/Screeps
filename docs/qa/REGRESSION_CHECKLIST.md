# Regression Checklist: Lightweight Economy & Memory Review

Use this checklist for surgical changes to **Memory**, **Spawn Heuristics**, or **Remote Mining**. This is a lightweight alternative to the full [Review Checklist](REVIEW_CHECKLIST.md) focused on multi-tick stability.

---

## 1. Memory & State Persistence
- [ ] **Ambient Types**: Is the new field in `src/main.ts` (`Memory`, `CreepMemory`, `RoomMemory`)?
- [ ] **Migration/Cleanup**: Does existing memory need a manual wipe or a migration bridge? (See [Memory Migration Rules](MEMORY_MIGRATIONS.md))
- [ ] **Stale Data**: Will this field grow forever? (e.g., does it need a `lastSeen` or `lastUpdated` timestamp?)

## 2. Spawn Heuristics & Balance
- [ ] **Energy Floor**: Can the room still spawn a basic miner/hauler if energy hits 300?
- [ ] **Pressure Analysis**: Does the new task kind correctly report its WORK/CARRY/MOVE demand to `SpawnManager`?
- [ ] **Priority**: Could a low-priority spawn (scout/upgrader) block a high-priority one (miner/defender)?

## 3. Remote Mining & Operations
- [ ] **Throughput Formula**: If changing `desiredHaulerCarry`, does it account for `routeLength`?
- [ ] **Safety Interlocks**: Does the task correctly abort if the room status becomes `DANGEROUS`?
- [ ] **Visibility**: Does the logic handle `null` results from `Game.getObjectById` when the room is invisible?

---

## 4. Multi-Tick Failure Modes (Watch for these in Simulation)

| Change Area | Failure Mode | Success Metric (100+ Ticks) |
| :--- | :--- | :--- |
| **Spawn Priority** | **Energy Death Spiral**: Non-economy creeps starve the room of energy. | `room.energyAvailable` recovers quickly after a mass-death. |
| **Body Design** | **Throughput Collapse**: Creeps are too expensive or too slow. | Creeps move with 0 fatigue; economy stays positive. |
| **Hauling** | **Remote Overflow**: Energy decays in remote containers. | No `ENERGY_DECAY` events in remote mining rooms. |
| **Remote Life** | **The Meat Grinder**: Repeated deaths to invaders or hostiles. | `Creep.ticksToLive` average stays high; task turnover is low. |

---

## 5. Gating Checks
- [ ] `npm run build` passes.
- [ ] Incremental Lint: New lines are clean (ignoring pre-existing debt).
- [ ] Multi-tick validation: Verified for 100+ ticks in Simulator or Private Server.
