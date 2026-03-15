# Memory

A global object for arbitrary persistent data storage. Accessible via API and the Memory UI. Limited to 2 MB.

Parsed via `JSON.parse` on first access each tick. Store object IDs, not live game objects.

```javascript
Game.creeps.John.memory.role = 'harvester';
console.log(Memory.creeps.John.role); // -> 'harvester'
```

---

# PathFinder

Powerful C++ pathfinding. Supports custom navigation costs and multi-room paths.

## PathFinder.search(origin, goal, [opts])

**Parameters:**
- `origin` (RoomPosition): Start position
- `goal` (object|array): Goal(s) with `pos` (RoomPosition) and `range` (number, default 0)
- `opts`:
  - `roomCallback(roomName)`: Returns CostMatrix per room
  - `plainCost` (default 1)
  - `swampCost` (default 5)
  - `flee` (default false): Search away from goals
  - `maxOps` (default 2000)
  - `maxRooms` (default 16, max 64)
  - `maxCost` (default Infinity)
  - `heuristicWeight` (default 1.2)

**Returns:** `{path, ops, cost, incomplete}`

```javascript
let ret = PathFinder.search(
  creep.pos, goals,
  {
    plainCost: 2,
    swampCost: 10,
    roomCallback: function(roomName) {
      let room = Game.rooms[roomName];
      if (!room) return;
      let costs = new PathFinder.CostMatrix;
      room.find(FIND_STRUCTURES).forEach(function(struct) {
        if (struct.structureType === STRUCTURE_ROAD) {
          costs.set(struct.pos.x, struct.pos.y, 1);
        } else if (struct.structureType !== STRUCTURE_CONTAINER &&
                   (struct.structureType !== STRUCTURE_RAMPART || !struct.my)) {
          costs.set(struct.pos.x, struct.pos.y, 0xff);
        }
      });
      room.find(FIND_CREEPS).forEach(function(creep) {
        costs.set(creep.pos.x, creep.pos.y, 0xff);
      });
      return costs;
    }
  }
);
```

## PathFinder.CostMatrix

Stores movement costs (0-255) for a room. 0xff blocks movement.

- `set(x, y, cost)` - Set cost at position
- `get(x, y)` - Get cost at position
- `clone()` - Independent copy
- `serialize()` / `deserialize(data)` - Compact storage

---

# RawMemory

Custom serialization and async memory segments (up to 10 MB additional).

- `segments` - Up to 100 segments, 100KB each. Set active via `setActiveSegments([0,3])`, available next tick.
- `foreignSegment` - Another player's public segment (`{username, id, data}`)
- `get()` / `set(value)` - Raw Memory string access
- `setActiveSegments(ids)` - Request segments (max 10 simultaneous)
- `setActiveForeignSegment(username, [id])`
- `setDefaultPublicSegment(id)`
- `setPublicSegments(ids)`

---

# Constants

## Return Codes
| Constant | Value |
|----------|-------|
| OK | 0 |
| ERR_NOT_OWNER | -1 |
| ERR_NO_PATH | -2 |
| ERR_NAME_EXISTS | -3 |
| ERR_BUSY | -4 |
| ERR_NOT_FOUND | -5 |
| ERR_NOT_ENOUGH_ENERGY / ERR_NOT_ENOUGH_RESOURCES | -6 |
| ERR_INVALID_TARGET | -7 |
| ERR_FULL | -8 |
| ERR_NOT_IN_RANGE | -9 |
| ERR_INVALID_ARGS | -10 |
| ERR_TIRED | -11 |
| ERR_NO_BODYPART | -12 |
| ERR_RCL_NOT_ENOUGH | -14 |
| ERR_GCL_NOT_ENOUGH | -15 |

## Body Parts
| Part | Cost | Function |
|------|------|----------|
| MOVE | 50 | Movement (removes 2 fatigue/tick) |
| WORK | 100 | Harvest (2/tick), Build (5/tick), Repair (100/tick), Upgrade (1/tick), Dismantle (50/tick) |
| CARRY | 50 | Carry capacity (50 per part) |
| ATTACK | 80 | Melee attack (30 damage) |
| RANGED_ATTACK | 150 | Ranged attack (10 damage, 3 range) |
| HEAL | 250 | Heal (12 adjacent, 4 ranged) |
| TOUGH | 10 | No function, just HP |
| CLAIM | 600 | Claim/reserve controllers |

## Key Constants
- CREEP_LIFE_TIME: 1500
- CREEP_CLAIM_LIFE_TIME: 600
- MAX_CREEP_SIZE: 50 parts
- MAX_CONSTRUCTION_SITES: 100
- CARRY_CAPACITY: 50 per part
- HARVEST_POWER: 2 energy per WORK per tick
- BUILD_POWER: 5 per WORK per tick
- REPAIR_POWER: 100 per WORK per tick
- UPGRADE_CONTROLLER_POWER: 1 per WORK per tick
- DISMANTLE_POWER: 50 per WORK per tick
- ATTACK_POWER: 30 per ATTACK per tick
- RANGED_ATTACK_POWER: 10 per RANGED_ATTACK per tick
- HEAL_POWER: 12 per HEAL per tick (adjacent)
- RANGED_HEAL_POWER: 4 per HEAL per tick (range 3)

## Terrain Masks
- TERRAIN_MASK_WALL: 1
- TERRAIN_MASK_SWAMP: 2

## Limits
- MAX_CONSTRUCTION_SITES: 100
- FLAGS_LIMIT: 10000
- MARKET_MAX_ORDERS: 300
