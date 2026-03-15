# Scripting Basics

## Execution Model

Scripts run in a loop each game tick. Orders are queued and resolved after all player scripts complete.

## Memory

- Global `Memory` object persists between ticks as JSON
- Limited to 2 MB
- Parsed via `JSON.parse` on first access each tick
- Store IDs, not live game objects

```javascript
creep.memory.sourceId = source.id;
var source = Game.getObjectById(creep.memory.sourceId);
```

## Modules

Node.js-style `require()` and `module.exports`:

```javascript
// scout.js
module.exports = {
    run(creep) { creep.moveTo(...); }
}

// main.js
var scout = require('scout');
scout.run(Game.creeps['Scout1']);
```

Lodash available: `var _ = require('lodash');`

Binary modules (WebAssembly) supported for C/C++/Rust performance.

## Global Objects

- `Game` - Interface to game world (does NOT persist between ticks)
- `Memory` - Persistent JSON storage (2 MB limit)
- `RawMemory` - Raw string access + segments (10 MB additional)

---

# Caching Strategies

## Memory Cache
- Persistent but expensive: JSON.parse runs every tick
- More data = more CPU. Store only essentials.

## Global Cache
- Faster than Memory but resets periodically (global resets)
- Good for data that's constant or where staleness is acceptable
- Excessive data triggers GC and CPU spikes

## Require Cache
- `require()` results cached until global reset
- Global resets are expensive due to re-compilation

## Tips
- Convert RoomPositions to strings before caching
- Use compression for large data
- Implement TTL in getters, not setters
- Clean up Memory regularly to prevent bloat
