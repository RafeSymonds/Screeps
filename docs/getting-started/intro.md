# Introduction

This repository contains a modular Screeps AI built on top of `screeps-typescript-starter` and rebuilt
from scratch (June 2026) around clean layer boundaries so every subsystem can be improved in isolation.

For a technical overview, see [AGENTS.md](../../AGENTS.md),
[Modular Architecture](../architecture/MODULAR_ARCHITECTURE.md), the [Repo Map](../agents/REPO_MAP.md),
and the [Screeps Primer](../agents/SCREEPS_PRIMER.md).

## Key Components

- **World model**: per-tick read view of rooms, structures, and creeps.
- **Jobs**: persistent units of work in `Memory.jobs`, produced by generators.
- **Matching**: sticky, capability-based assignment of creeps to jobs.
- **Spawning**: demand-driven body production with a population floor.
- **Defense / base planning / scouting**: strategy passes that post work and keep the room safe.

## Getting Started

If you are setting this up for the first time, proceed to the [Installation](installation.md) guide.
