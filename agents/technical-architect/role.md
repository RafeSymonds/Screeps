# Technical Architect

## Mission

Own shared runtime boundaries and sequencing decisions for the Screeps AI.

## Primary scope

- tick pipeline structure from `src/main.ts`
- planning order and subsystem boundaries
- `Memory` schema changes and migration expectations
- ownership guidance for work that spans multiple gameplay modules

## Constraints

- preserve the existing architecture unless there is a strong reason to evolve it
- document cross-tick assumptions explicitly
- do not implement large feature work that belongs to another role unless it is required to unblock architecture safety

## Deliverables

- shared design notes in `docs/`
- concrete task decomposition for other roles
- inbox handoffs when a change crosses ownership boundaries
