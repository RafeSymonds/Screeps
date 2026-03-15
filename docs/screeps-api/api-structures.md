# Structures API Reference

## Structure (Base Class)

| Property | Type | Description |
|----------|------|-------------|
| hits | number | Current HP |
| hitsMax | number | Max HP |
| id | string | Unique ID |
| structureType | string | STRUCTURE_* type |
| pos | RoomPosition | Position |

**Methods:** `destroy()`, `isActive()`, `notifyWhenAttacked(enabled)`

## OwnedStructure (extends Structure)

Additional: `my` (boolean), `owner` ({username})

---

## StructureContainer
- `store` (Store): Contents
- `ticksToDecay` (number): Decay timer

## StructureController
| Property | Type | Description |
|----------|------|-------------|
| level | number | RCL 1-8 |
| progress | number | Progress to next level |
| progressTotal | number | Total needed |
| isPowerEnabled | boolean | Power processing active |
| ticksToDowngrade | number | Ticks until downgrade |
| upgradeBlocked | number | Ticks of upgrade block |
| safeMode | number | Remaining safe mode ticks |
| safeModeAvailable | number | Available activations |
| safeModeCooldown | number | Cooldown ticks |
| sign | object | Controller sign |
| reservation | object | Reservation details |

**Methods:** `activateSafeMode()`, `unclaim()`

## StructureExtension
- `store` (Store): Energy storage
- Capacity scales with RCL: 50 (RCL 2-6), 100 (RCL 7), 200 (RCL 8)

## StructureExtractor
- `cooldown` (number): Harvest cooldown

## StructureFactory
- `level` (number): 0-8
- `cooldown` (number): Production cooldown
- `store` (Store): Inventory
- **Methods:** `produce(resourceType)`

## StructureInvaderCore
- `level` (number): Strength level
- `ticksToDeploy` (number): Deploy timer

## StructureKeeperLair
- `ticksToSpawn` (number): Next keeper spawn timer

## StructureLab
| Property | Type |
|----------|------|
| cooldown | number |
| mineralAmount | number |
| mineralType | string |
| store | Store |

**Methods:**
- `boostCreep(creep, [bodypartType])` - Boost with compounds (30 mineral + 20 energy per part)
- `runReaction(lab1, lab2)` - Combine minerals
- `reverseReaction(lab1, lab2)` - Decompose compound
- `unboostCreep(creep)` - Remove boosts

## StructureLink
- `store` (Store): Energy (max 800)
- `cooldown` (number): Transfer cooldown
- **Methods:** `transferEnergy(targetLink, [amount])` - 3% energy loss

## StructureNuker
- `store` (Store): Energy (300,000) + Ghodium (5,000)
- `cooldown` (number): Launch cooldown
- **Methods:** `launchNuke(pos)` - Lands in 50,000 ticks, 10M damage center tile

## StructureObserver
- **Methods:** `observeRoom(roomName)` - Scan up to 10 rooms away

## StructurePowerBank
- `power` (number): Extractable power
- `ticksToDecay` (number): Despawn timer
- Reflects 50% damage back to attacker

## StructurePowerSpawn
- `store` (Store): Energy (5,000) + Power (100)
- **Methods:** `processPower()` - 50 energy per power unit

## StructurePortal
- `destination` (object): Target location
- `ticksToDecay` (number): Lifetime

## StructureRampart
- `isPublic` (boolean): Non-owner walkthrough
- `ticksToDecay` (number): Decay timer (500 ticks)
- Max HP by RCL: 300K (RCL 2) → 300M (RCL 8)
- **Methods:** `setPublic(isPublic)`

## StructureRoad
- `ticksToDecay` (number): 1,000 ticks
- Reduces movement fatigue

## StructureSpawn
| Property | Type | Description |
|----------|------|-------------|
| store | Store | Energy (max 300) |
| memory | object | Persistent data |
| name | string | Spawn name |
| spawning | Spawning/null | Current spawn process |

**Methods:**
- `spawnCreep(body, name, [opts])` - Create creep (3 ticks per body part)
  - opts: `{directions, memory, energyStructures, dryRun}`
- `renewCreep(creep)` - Restore lifespan (1.2x creation cost)
- `recycleCreep(creep)` - Disassemble, return energy

### StructureSpawn.Spawning
- `name`, `needTime`, `remainingTime`, `directions`, `spawn`
- **Methods:** `setDirections(directions)`, `cancel()`

## StructureStorage
- `store` (Store): Max 1,000,000 capacity

## StructureTerminal
- `store` (Store): Max 300,000 capacity
- `cooldown` (number): 10 ticks between transfers
- **Methods:** `send(resourceType, amount, destination, [description])` - Min 100 units

## StructureTower
- `store` (Store): Energy (max 1,000)
- **Methods:**
  - `attack(target)` - 600 damage at optimal range, 75% at 20 tiles
  - `heal(target)` - 400 HP at optimal range
  - `repair(target)` - 800 repair at optimal range
- Optimal range: 5 tiles, degrades beyond 20 tiles

## StructureWall
- Max HP: 300,000,000
- No special methods
