# CPU Limit System

## Overview

Each tick, all player scripts execute concurrently. CPU time limit caps script execution in milliseconds.

CPU limit 100 = 100ms max execution per tick. Baseline depends on GCL (if CPU Unlock active) or defaults to 20ms.

## The Bucket

Unused CPU accumulates across ticks:
- **Max bucket**: 10,000 CPU
- **Burst**: Can exceed baseline by up to 500 CPU per tick when bucket has credits
- Example: 150 CPU baseline, 100 used → accumulate 50/tick → enables 500 CPU bursts periodically

## Key API Properties

- `Game.cpu.tickLimit`: Max spendable CPU this tick
- `Game.cpu.bucket`: Current accumulated CPU
- `Game.cpu.limit`: Baseline account limit
- `Game.cpu.getUsed()`: CPU consumed so far this tick

## Strategy

- Postpone expensive operations (pathfinding, room scanning) to burst windows
- Monitor bucket level to avoid running out
- Use `cpu.generatePixel()` when bucket is at 10,000 (costs 10,000 bucket → 1 pixel)
