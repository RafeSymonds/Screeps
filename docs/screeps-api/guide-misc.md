# Miscellaneous Guides

## Respawning

- Choose rooms with two sources inside Start Areas
- Initial safe mode: ~20,000 ticks (~15 hours)
- Spawn generates 1 energy/tick until 300 energy in room
- Respawn timeout: 180 seconds
- GCL preserved after respawn — can immediately reclaim rooms

## Start Areas

### Novice Areas (green)
- Isolated from outer world by indestructible walls
- GCL 3 or lower only
- Max 3 rooms claimed, unlimited reservations
- No safe mode cooldown
- No nukers
- Walls open on timer (quarters open before outer walls)

### Respawn Areas (blue)
- Similar isolation, fewer restrictions
- All GCL levels welcome
- Only restriction: no nukers

## Debugging

- `console.log()` for output
- All actions return OK or ERR_* codes
- Use Memory inspector for real-time value tracking
- Public Test Realm for safe testing

## Server Architecture

- Node.js 8.9.3, MongoDB, Redis
- Two-phase ticks: player script execution → command processing
- Player code isolated via Node.js `vm` module
- Global objects reusable across tick executions (until global reset)

## Modifying Prototypes

Extend game objects with custom methods/properties:

```javascript
Creep.prototype.sayHello = function() { this.say("Hello!"); };

Object.defineProperty(Room.prototype, 'sources', {
    get: function() { return this.find(FIND_SOURCES); },
    enumerable: false, configurable: true
});
```

Cache in private properties (lost between ticks) or Memory (persistent, store IDs only).
