# Room API Reference

Represents a 50x50 game world space.

## Properties

| Property | Type | Description |
|----------|------|-------------|
| controller | StructureController | Room controller (or null) |
| energyAvailable | number | Current energy in spawns + extensions |
| energyCapacityAvailable | number | Max energy capacity of spawns + extensions |
| memory | object | Persistent room data |
| name | string | Room name (e.g., "W1N1") |
| storage | StructureStorage | Room storage (or null) |
| terminal | StructureTerminal | Room terminal (or null) |
| visual | RoomVisual | Visual instance for this room |

## Methods

### createConstructionSite(x, y, structureType)
Place a construction site.

### createFlag(x, y, [name], [color], [secondaryColor])
Create a flag. Returns flag name or error.

### find(type, [opts])
Search for objects using FIND_* constants. Returns array.

### findExitTo(room)
Direction to exit toward specified room.

### findPath(fromPos, toPos, [opts])
A* pathfinding between two positions.

### getEventLog()
Event log for current tick.

### getPositionAt(x, y)
Create RoomPosition for coordinates.

### getTerrain()
Returns Room.Terrain object for static terrain data.

### lookAt(target)
Objects at specified position.

### lookAtArea(top, left, bottom, right)
Object matrix for rectangular area.

### lookForAt(type, target)
Objects at position filtered by LOOK_* constant.

### lookForAtArea(type, top, left, bottom, right)
Filtered object matrix.

### serializePath(path) / deserializePath(path)
Path serialization for compact storage.

---

# Room.Terrain

Static terrain data. Fast lookups without iteration.

### get(x, y)
Returns: `TERRAIN_MASK_WALL` (1), `TERRAIN_MASK_SWAMP` (2), or `0` (plain).

### getRawBuffer()
Raw binary terrain data as ArrayBuffer.

---

# RoomObject

Base class for all game objects in rooms.

### Properties
- `effects` (array): Active visual effects
- `pos` (RoomPosition): Current position
- `room` (Room): Containing room

---

# RoomPosition

Single coordinate in the game world.

### Constructor
`new RoomPosition(x, y, roomName)` - x,y: 0-49

### Properties
- `roomName` (string)
- `x` (number): 0-49
- `y` (number): 0-49

### Methods

| Method | Description |
|--------|-------------|
| createConstructionSite(structureType) | Place construction site |
| createFlag([name], [color], [secondaryColor]) | Create flag |
| findClosestByPath(type, [opts]) | Nearest by pathfinding |
| findClosestByRange(type, [opts]) | Nearest by Euclidean distance |
| findInRange(type, range, [opts]) | All objects within range |
| findPathTo(target, [opts]) | A* path to target |
| getDirectionTo(target) | Direction constant (1-8) |
| getRangeTo(target) | Chebyshev distance |
| inRangeTo(target, range) | Check if within range |
| isEqualTo(target) | Position equality |
| isNearTo(target) | Within range 1 |
| look() | All objects at position |
| lookFor(type) | Objects filtered by LOOK_* |

---

# RoomVisual

Temporary debug graphics. 1,024,000 bytes max per tick.

### Methods
- `line(pos1, pos2, [style])` - Draw line
- `circle(pos, [style])` - Draw circle
- `rect(topLeftPos, width, height, [style])` - Draw rectangle
- `poly(points, [style])` - Draw polygon
- `text(text, pos, [style])` - Place text
- `clear()` - Remove all visuals
- `getSize()` - Current size in bytes
- `export()` / `import(val)` - Serialize/restore visuals

All drawing methods are chainable. Style: width, color, opacity, lineStyle, fill, stroke, strokeWidth, font properties, align, backgroundColor.
