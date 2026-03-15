# Power System Guide

## Overview

End-game mechanic focused on colony optimization rather than expansion.

## Power Banks

Appear in neutral highway rooms. Contain harvestable power. Reflect 50% damage back to attackers — bring healers.

## Global Power Level (GPL)

- RCL 8 rooms unlock Power Spawns
- `processPower()`: 1 power + 50 energy → GPL progress
- Each GPL level unlocks Power Creep development

## Power Creeps

Immortal hero units tied to your account. Three classes:

### Operator (base-focused)
Key powers:
- **GENERATE_OPS**: Produces ops (50-tick CD)
- **OPERATE_SPAWN**: Reduce spawn time 10-80%
- **OPERATE_TOWER**: Boost tower effectiveness 10-50%
- **OPERATE_STORAGE**: Boost capacity 500K-7M
- **OPERATE_LAB**: Increase reactions 2-10 units
- **OPERATE_EXTENSION**: Fill extensions 20-100%
- **OPERATE_TERMINAL**: Reduce transfer costs 10-50%
- **OPERATE_CONTROLLER**: Boost upgrade capacity
- **OPERATE_FACTORY**: Set factory level permanently
- **REGEN_SOURCE**: Restore 50-250 source energy
- **REGEN_MINERAL**: Restore 2-10 minerals
- **SHIELD**: Temporary rampart 5K-25K hits
- **FORTIFY**: Walls invulnerable 1-5 ticks

Offensive:
- **DISRUPT_SPAWN**: Pause spawning 1-5 ticks
- **DISRUPT_TOWER**: Reduce effectiveness 10-50%
- **DISRUPT_SOURCE**: Pause energy regen
- **DISRUPT_TERMINAL**: Block terminal 10 ticks

### Commander (team-oriented) — Under development
### Executor (solo-focused) — Under development

## Notes

- Each level costs 1 GPL
- 8-hour respawn cooldown after death
- Renew at Power Spawns or Power Banks
- Deleting a Power Creep decreases GPL by 1
- 30 free re-rolls in experimentation period (24h windows)
