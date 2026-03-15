# Game Objects API Reference

## ConstructionSite

A structure under construction.

| Property | Type | Description |
|----------|------|-------------|
| id | string | Unique ID |
| my | boolean | Ownership |
| owner | object | `{username}` |
| progress | number | Current work completed |
| progressTotal | number | Total work needed |
| structureType | string | STRUCTURE_* type |
| pos | RoomPosition | Position |

**Methods:** `remove()` - Destroy this site.

---

## Deposit

Mineral deposit in highway rooms. Four types: silicon, metal, biomass, mist.

| Property | Type | Description |
|----------|------|-------------|
| cooldown | number | Ticks until harvestable |
| depositType | string | RESOURCE_* constant |
| id | string | Unique ID |
| lastCooldown | number | Previous cooldown value |
| ticksToDecay | number | Ticks until disappears |

---

## Flag

Player-placed location marker.

| Property | Type | Description |
|----------|------|-------------|
| color | number | Primary COLOR_* |
| secondaryColor | number | Secondary COLOR_* |
| memory | object | Memory.flags[name] |
| name | string | Flag name |

**Methods:**
- `remove()` - Delete flag
- `setColor(primaryColor, [secondaryColor])` - Change color
- `setPosition(pos)` - Move flag

---

## Mineral

Room mineral deposit. One per room, seven base types.

| Property | Type | Description |
|----------|------|-------------|
| density | number | DENSITY_* (1-4) |
| mineralAmount | number | Remaining amount |
| mineralType | string | RESOURCE_* type |
| id | string | Unique ID |
| ticksToRegeneration | number | Ticks until regen (if depleted) |

---

## Nuke

Nuclear missile in flight.

| Property | Type | Description |
|----------|------|-------------|
| id | string | Unique ID |
| launchRoomName | string | Origin room |
| timeToLand | number | Ticks until detonation |
| pos | RoomPosition | Target position |

---

## Resource

Dropped resource pile.

| Property | Type | Description |
|----------|------|-------------|
| amount | number | Quantity |
| id | string | Unique ID |
| resourceType | string | RESOURCE_* type |

---

## Ruin

Remains of a destroyed structure.

| Property | Type | Description |
|----------|------|-------------|
| destroyTime | number | Tick when destroyed |
| id | string | Unique ID |
| store | Store | Remaining resources |
| structure | object | `{structureType}` |
| ticksToDecay | number | Ticks until disappears |

---

## Source

Energy source. Regenerates every 300 ticks.

| Property | Type | Description |
|----------|------|-------------|
| energy | number | Current energy |
| energyCapacity | number | Max energy (typically 3000) |
| id | string | Unique ID |
| ticksToRegeneration | number | Ticks until full regen |

---

## Store

Container for multiple resource types.

**Methods:**
- `getCapacity([resourceType])` - Total capacity
- `getFreeCapacity([resourceType])` - Available space
- `getUsedCapacity([resourceType])` - Used space

---

## Tombstone

Remains of a dead creep.

| Property | Type | Description |
|----------|------|-------------|
| creep | object | Dead creep info (name, owner, body) |
| deathTime | number | Death tick |
| id | string | Unique ID |
| store | Store | Dropped resources |
| ticksToDecay | number | Ticks until disappears |
