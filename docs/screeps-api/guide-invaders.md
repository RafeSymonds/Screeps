# NPC Invaders Guide

## Spawn Mechanics

Invaders appear after ~100,000 units of energy mined (with variance). They spawn at exits to neutral rooms only — not at exits to controlled/reserved rooms.

## Capabilities

- Can attack, rangedAttack, and dismantle
- Cannot traverse between rooms
- Will destroy obstacles in their path

## Raid Groups (10% chance)

2-5 creeps with:
- Melee attackers
- Ranged attackers
- Healers
- Boosted variants (UH, KO, LO, ZH, GO)

## Difficulty Scaling

| Room Level | Invader Strength |
|------------|-----------------|
| Neutral, reserved, RCL 1-3 | Light creeps |
| RCL 4+ | Heavy creeps |

## Strongholds

NPC bases within sectors. Destroying a stronghold stops invasions until the next one spawns.

- Contain loot in containers and core structures
- Difficulty indicated by `StructureInvaderCore.level`
- Active strongholds spawn lesser cores in neutral rooms
- Lesser cores reserve controllers, blocking energy harvesting
