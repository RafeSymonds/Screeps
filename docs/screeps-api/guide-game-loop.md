# Game Loop, Time and Ticks

## Tick Execution

The next tick begins only after ALL players' main modules execute. Three stages:

### 1. Beginning Stage
Game state is fixed with specific property values. Modifications occur at start of next tick.

### 2. Middle Stage (Your Code)
Your main module executes with an unchangeable game state. If a creep moves then attacks in the same tick, the attack uses the ORIGINAL position since coordinates update next tick.

### 3. End Stage
All accumulated commands are processed. Conflicts resolved by priority. Simultaneous actions (e.g., mutual attacks) can result in concurrent deaths.

## Key Points
- All runtime variables reset between ticks
- `Game.time` is the global tick counter
- CPU limited by `Game.cpu.tickLimit`
- Console commands follow same execution rules

---

# Simultaneous Actions

## Action Dependencies

When dependent methods are called same tick, only the last one executes. Order matters.

## Methods That CAN Execute Simultaneously
- `moveTo()`, `rangedMassAttack()`, `heal()`, `transfer()`, `drop()`, `pickup()`, `claimController()`

## Priority Rules
When same method called multiple times, **last call wins**.

## Important Constraints
- `transfer()` single target only per tick
- CARRY methods use energy amounts from **beginning of tick**
- Healing unharmed creeps returns OK but blocks other actions in dependency chain
