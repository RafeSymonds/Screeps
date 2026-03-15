# Market Guide

## Overview

Trade resources through Terminals using Credits (in-game currency).

## Orders

- Create buy/sell orders connected to your terminal
- Specify resource type, quantity, unit price
- All orders publicly visible
- 5% credit fee on order creation
- Max 300 orders per player

## Trading

The party executing `deal()` pays energy costs and terminal cooldown.

- Terminal cooldown: 10 ticks between transfers
- Max 10 deals per tick
- Min 100 units per terminal.send()
- Energy cost: `Math.ceil(amount * (1 - Math.exp(-distance/30)))`

## NPC Terminals

Located at highway crossroads (W0N0, W10N10, etc.). Offer limited resources at less competitive prices.
