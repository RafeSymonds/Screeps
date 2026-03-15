# Game API Reference

Main global game object containing all gameplay information.

## Properties

### constructionSites
- **Type:** `object<string, ConstructionSite>`
- Hash of all construction sites indexed by ID

### cpu
- **Type:** `object`
- Properties:
  - `limit` (number): Assigned CPU limit for current shard
  - `tickLimit` (number): Available CPU time at current tick
  - `bucket` (number): Accumulated unused CPU
  - `shardLimits` (object): CPU limits per shard
  - `unlocked` (boolean): Whether full CPU is unlocked
  - `unlockedTime` (number): Milliseconds until unlock expires

### creeps
- **Type:** `object<string, Creep>`
- Hash of all creeps indexed by name

### flags
- **Type:** `object<string, Flag>`
- Hash of all flags indexed by name

### gcl
- **Type:** `object`
- Properties:
  - `level` (number): Current Global Control Level
  - `progress` (number): Progress toward next level
  - `progressTotal` (number): Total progress required

### gpl
- **Type:** `object`
- Properties:
  - `level` (number): Current Global Power Level
  - `progress` (number): Current progress
  - `progressTotal` (number): Required progress

### map
- **Type:** `object`
- Global world map object (see Game.map section)

### market
- **Type:** `object`
- In-game market object (see Game.market section)

### powerCreeps
- **Type:** `object<string, PowerCreep>`
- Hash of all power creeps indexed by name

### resources
- **Type:** `object`
- Account-bound resources (pixels, CPU unlocks, etc.)

### rooms
- **Type:** `object<string, Room>`
- Visible rooms indexed by name

### shard
- **Type:** `object`
- Properties:
  - `name` (string): Shard identifier
  - `type` (string): Always "normal"
  - `ptr` (boolean): Whether shard is PTR

### spawns
- **Type:** `object<string, StructureSpawn>`
- All spawns indexed by name

### structures
- **Type:** `object<string, Structure>`
- All structures indexed by ID

### time
- **Type:** `number`
- System game tick counter, automatically incremented every tick

## Methods

### cpu.getHeapStatistics()
- **Returns:** Object with heap statistics (total_heap_size, used_heap_size, heap_size_limit, etc.)
- **Note:** Only available with Isolated VM setting

### cpu.getUsed()
- **Returns:** `number` - CPU time used from tick start
- **Example:** `if(Game.cpu.getUsed() > Game.cpu.tickLimit / 2) { ... }`

### cpu.halt()
- **Returns:** void
- Resets runtime and wipes heap memory (Isolated VM only)

### cpu.setShardLimits(limits)
- **Parameter:** `limits` (object) - CPU values per shard
- **Returns:** `OK` (0), `ERR_BUSY` (-4), or `ERR_INVALID_ARGS` (-10)
- Once per 12 hours maximum

### cpu.unlock()
- **Returns:** `OK` (0), `ERR_NOT_ENOUGH_RESOURCES` (-6), or `ERR_FULL` (-8)
- Unlocks full CPU for 24 hours

### cpu.generatePixel()
- **Returns:** `OK` (0) or `ERR_NOT_ENOUGH_RESOURCES` (-6)
- Cost: 10,000 CPU from bucket generates 1 pixel

### getObjectById(id)
- **Parameter:** `id` (string) - Unique object identifier
- **Returns:** Object instance or null

### notify(message, [groupInterval])
- **Parameters:**
  - `message` (string): Custom text (max 1000 chars)
  - `groupInterval` (number): Minutes to group notifications (default 0)
- Maximum 20 notifications per tick

---

# InterShardMemory

Provides inter-shard communication with 100 KB per shard in string format.

### getLocal()
- **Returns:** `string` - Current shard's data contents

### setLocal(value)
- **Parameter:** `value` (string) - New data value

### getRemote(shard)
- **Parameter:** `shard` (string) - Target shard name
- **Returns:** `string` - Remote shard's data

---

# Game.map

Global object for world navigation between rooms.

### describeExits(roomName)
- **Returns:** Object with exit directions `{1: "W8N4", 3: "W7N3", 5: "W8N2", 7: "W9N3"}` or null

### findExit(fromRoom, toRoom, [opts])
- **Returns:** Direction constant (`FIND_EXIT_TOP`, etc.) or error code

### findRoute(fromRoom, toRoom, [opts])
- `opts.routeCallback`: `function(roomName, fromRoomName)` - return cost or Infinity to block
- **Returns:** Array of `{exit, room}` objects or `ERR_NO_PATH`

### getRoomLinearDistance(roomName1, roomName2, [continuous])
- **Returns:** `number` - Distance in rooms

### getRoomTerrain(roomName)
- **Returns:** Room.Terrain object for fast static terrain access

### getWorldSize()
- **Returns:** `number` - World size in rooms

### getRoomStatus(roomName)
- **Returns:** `{status, timestamp}` - status is "normal", "closed", "novice", or "respawn"

---

# Game.map.visual

Map visualization with 1000 KB limit per tick.

### line(pos1, pos2, [style])
### circle(pos, [style])
### rect(topLeftPos, width, height, [style])
### poly(points, [style])
### text(text, pos, [style])
### clear()
### getSize()
### export()
### import(val)

All drawing methods return MapVisual (chainable). Style options include width, color (hex), opacity, lineStyle ("dashed"/"dotted"), fill, stroke, strokeWidth, font properties.

---

# Game.market

In-game marketplace for resource trading via terminals.

## Properties

### credits
- `number` - Current account credits balance

### incomingTransactions / outgoingTransactions
- Last 100 transactions with: `transactionId`, `time`, `sender`, `recipient`, `resourceType`, `amount`, `from`, `to`, `description`, `order`

### orders
- Active buy/sell orders with: `id`, `created`, `active`, `type`, `resourceType`, `roomName`, `amount`, `remainingAmount`, `totalAmount`, `price`

## Methods

### calcTransactionCost(amount, roomName1, roomName2)
- Formula: `Math.ceil(amount * (1 - Math.exp(-distanceBetweenRooms/30)))`
- **Returns:** Energy units required

### cancelOrder(orderId)
- 5% fee is not returned

### changeOrderPrice(orderId, newPrice)
- Cost if price increases: `(newPrice - oldPrice) × remainingAmount × 0.05` credits

### createOrder(params)
- `params`: `{type, resourceType, price, totalAmount, roomName}`
- Cost: `price × amount × 0.05` credits
- Max 50 orders

### deal(orderId, amount, [yourRoomName])
- Max 10 deals per tick
- Terminal charged energy for transfer cost regardless of resource type

### extendOrder(orderId, addAmount)
### getAllOrders([filter])
### getHistory([resourceType])
- Last 14 days of daily records

### getOrderById(id)
