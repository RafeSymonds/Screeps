# Defense Guide

## Safe Mode

Prevents hostile creeps from affecting your structures/units. Lasts ~20,000 ticks (~15 hours). Reactivate via `controller.activateSafeMode()`.

- Controllers gain one activation per level
- Additional activations from ghodium (1000 G per activation)
- **Only one room per shard** can be in safe mode at a time
- Last resort, not primary defense

## Walls

- Initial HP: 1
- Max HP: 300,000,000
- Block both enemy AND friendly creeps
- Require continuous repair to be effective

## Ramparts

- Friendly creeps pass through, enemies cannot
- Units ON ramparts are invulnerable until rampart destroyed
- Gradually lose HP over time (need maintenance)
- Max HP scales with RCL (300K at RCL 2 → 300M at RCL 8)
- Can be set public/private

## Towers

Available at RCL 3+. Cost: 10 energy per action.

- **Attack**: 600 damage at optimal range (5 tiles), 75% at 20 tiles
- **Heal**: 400 HP at optimal range
- **Repair**: 800 per action at optimal range

```javascript
function defendRoom(roomName) {
    var hostiles = Game.rooms[roomName].find(FIND_HOSTILE_CREEPS);
    if(hostiles.length > 0) {
        var towers = Game.rooms[roomName].find(
            FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}});
        towers.forEach(tower => tower.attack(hostiles[0]));
    }
}
```

## Creep Defenders

Complement towers against coordinated invasions. Position on ramparts for maximum protection.
