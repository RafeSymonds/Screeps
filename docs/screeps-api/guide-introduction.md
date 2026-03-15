# Introduction to Screeps

Screeps is a massively multiplayer online real-time strategy game where each player creates their own colony in a single persistent world shared by all players.

## Game World Structure

The game world comprises interconnected rooms, each measuring 50x50 cells. Rooms connect through 1-4 exits to adjacent spaces. "Shards" function as a Z-axis dimension linked via intershard portals.

### Terrain Types
- **Plain land** - traversable at standard cost (2 fatigue per non-MOVE part)
- **Swamps** - increased movement difficulty (10 fatigue per non-MOVE part)
- **Walls** - impassable barriers

### Infrastructure
- **Roads** - reduce traversal cost to 1 fatigue, deteriorate with use
- **Constructed walls** - player-built barriers, vulnerable to attack
- **Ramparts** - defensive structures shielding allied units, deteriorate each tick

New players enjoy "safe mode" protection initially.

## Colony Mechanics

**Energy sources** are the primary resource, harvested by worker units. Sources regenerate every 300 ticks.

**Spawns** accumulate harvested energy for unit creation. Max 3 spawns per room. Basic units spawn directly; advanced units require "extensions."
