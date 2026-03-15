# Creep API Reference

Creeps are mobile units with a limited lifespan of 1500 ticks. Assembled from up to 50 body parts.

## Properties

| Property | Type | Description |
|----------|------|-------------|
| body | array | Body part objects |
| fatigue | number | Movement fatigue (decreases when stationary) |
| hits | number | Current HP |
| hitsMax | number | Max HP |
| id | string | Unique identifier |
| memory | any | Persistent data (alias for Memory.creeps[name]) |
| my | boolean | Ownership |
| name | string | Creep name |
| owner | object | `{username}` |
| pos | RoomPosition | Current position |
| room | Room | Current room |
| saying | string | Message from say() |
| spawning | boolean | Currently being spawned |
| store | Store | Inventory |
| ticksToLive | number | Remaining ticks (max 1500) |
| effects | array | Active effects |

## Methods

### attack(target)
Attack adjacent hostile creep/structure. Requires ATTACK parts.
- Returns: OK, ERR_NOT_OWNER, ERR_BUSY, ERR_INVALID_TARGET, ERR_NOT_IN_RANGE, ERR_NO_BODYPART

### attackController(target)
Downgrade a room controller. Requires CLAIM parts, must be adjacent.

### build(target)
Build a construction site. Requires WORK parts and energy. Range 3.
- Power: 5 per WORK part per tick

### cancelOrder(methodName)
Cancel a queued action.

### claimController(target)
Claim an unowned controller. Requires CLAIM parts, must be adjacent.

### dismantle(target)
Dismantle adjacent structure. Requires WORK parts. Returns 50% of resources.
- Power: 50 per WORK part per tick

### drop(resourceType, [amount])
Drop resources from carry.

### generateSafeMode(target)
Generate safe mode activation for your controller (costs 1000 ghodium).

### getActiveBodyparts(type)
Count active body parts of specified type.

### harvest(target)
Harvest energy from Source or mineral from Mineral/Deposit. Requires WORK parts, must be adjacent.
- Power: 2 energy per WORK part per tick

### heal(target)
Heal adjacent creep. Requires HEAL parts.
- Power: 12 HP per HEAL part per tick

### move(direction)
Move one tile in specified direction.

### moveByPath(path)
Follow a pre-computed path array or serialized path string.

### moveTo(target, [opts])
Move toward target using pathfinding. Supports all PathFinder options.

### notifyWhenAttacked(enabled)
Toggle attack notifications.

### pickup(target)
Pick up adjacent dropped resource.

### pull(target)
Pull adjacent creep toward you.

### rangedAttack(target)
Attack target up to 3 squares away. Requires RANGED_ATTACK parts.
- Power: 10 per RANGED_ATTACK part per tick

### rangedHeal(target)
Heal target up to 3 squares away. Requires HEAL parts.
- Power: 4 HP per HEAL part per tick

### rangedMassAttack()
Attack all hostiles within 3 squares. Damage decreases with distance.

### repair(target)
Repair adjacent structure. Requires WORK parts and energy.
- Power: 100 per WORK part per tick

### reserveController(target)
Reserve neutral controller. Requires CLAIM parts, must be adjacent.

### say(message, [toPublic])
Display message (max 10 chars) above creep.

### signController(target, text)
Sign a controller (max 100 chars). Must be adjacent.

### suicide()
Instantly kill creep, dropping all resources.

### transfer(target, resourceType, [amount])
Transfer resources to adjacent creep/structure.

### upgradeController(target)
Upgrade your controller. Requires WORK parts and energy. Range 3.
- Power: 1 per WORK part per tick

### withdraw(target, resourceType, [amount])
Withdraw resources from adjacent structure/creep/tombstone/ruin.

---

# PowerCreep API Reference

Immortal hero units tied to player accounts. Persist after death with 8-hour respawn cooldown.

## Properties
- className, deleteTime, effects, hits, hitsMax, id, level (0-25), memory, my, name, owner, pos, powers, room, saying, shard, spawnCooldownTime, store, ticksToLive

## Methods
Same movement/resource methods as Creep, plus:
- `create(prototype)` - Static: create new power creep
- `delete()` - Permanently delete
- `enableRoom(controller)` - Enable power processing
- `rename(newName)` - Rename
- `renew(spawnStructure)` - Renew at power spawn
- `spawn(powerSpawn)` - Spawn/respawn
- `upgrade(powerSpawn)` - Upgrade powers
- `usePower(power, [target])` - Activate special ability
