# Control Levels Guide

## Global Control Level (GCL)

Determines:
1. **CPU Limit**: Starting at 20, +10 per GCL level (max 300)
2. **Room Control Capacity**: Number of rooms you can control = GCL level

GCL persists permanently on your account, even after losing all rooms.

## Room Controller Level (RCL)

Upgrade via `upgradeController()` using WORK parts + energy.

## Structures Available per RCL

| RCL | Energy | Extensions | Towers | Spawns | Other |
|-----|--------|------------|--------|--------|-------|
| 0 | — | 0 | 0 | 0 | Roads, 5 Containers |
| 1 | 200 | 0 | 0 | 1 | Roads, 5 Containers |
| 2 | 45K | 5 (50 cap) | 0 | 1 | Ramparts (300K HP), Walls |
| 3 | 135K | 10 (50 cap) | 1 | 1 | |
| 4 | 405K | 20 (50 cap) | 1 | 1 | Storage |
| 5 | 1.2M | 30 (50 cap) | 2 | 1 | 2 Links |
| 6 | 3.6M | 40 (50 cap) | 2 | 1 | 3 Links, Extractor, 3 Labs, Terminal |
| 7 | 10.9M | 50 (100 cap) | 3 | 2 | 4 Links, 6 Labs, Factory |
| 8 | — | 60 (200 cap) | 6 | 3 | 6 Links, 10 Labs, Observer, PowerSpawn, Nuker |

## Controller Downgrade

A controller not upgraded will slowly downgrade. Timer depends on RCL. At level 0, it becomes neutral and claimable.

Use `attackController()` to reduce an opponent's downgrade timer.
