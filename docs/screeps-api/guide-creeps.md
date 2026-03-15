# Creeps Guide

## Overview

Creeps are assembled from up to 50 body parts, creating diverse role specializations. Each creep has a lifespan of 1500 game ticks.

## Spawning

A standard spawn can produce creeps costing up to 300 energy. Extensions add capacity (50 energy each). Available extensions depend on RCL.

## Body Part Types

| Part | Cost | Function |
|------|------|----------|
| WORK | 100 | Harvest, build, repair, upgrade, dismantle |
| MOVE | 50 | Locomotion (removes 2 fatigue/tick) |
| CARRY | 50 | Resource transport (50 capacity/part) |
| ATTACK | 80 | Close-range combat (30 damage) |
| RANGED_ATTACK | 150 | 3-range combat (10 damage) |
| HEAL | 250 | Restore HP (12 adjacent, 4 ranged) |
| TOUGH | 10 | Extra HP, no function |
| CLAIM | 600 | Territory control |

Ability potency scales linearly with part quantity.

## Movement System

Each non-MOVE body part generates fatigue:
- **Roads**: 1 fatigue per part
- **Plains**: 2 fatigue per part
- **Swamps**: 10 fatigue per part

Each MOVE part removes 2 fatigue per tick.

**To move at max speed (1 tile/tick):** need as many MOVE parts as all other parts combined.

## Damage

Creeps have 100 HP per body part. Damage targets parts in spawn order (first parts damaged first). Total part destruction disables its function.

**Tip:** Put TOUGH parts first (they're cheap HP shields), MOVE parts in the middle or distributed, and important parts (WORK, HEAL) last.
