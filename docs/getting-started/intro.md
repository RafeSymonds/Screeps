# Introduction

This repository contains a custom Screeps AI built on top of the `screeps-typescript-starter`. It has been extended with high-level planning, CPU-aware task scheduling, and a robust world-model view.

For a technical overview of how this AI operates, please refer to the [Repo Map](../agents/REPO_MAP.md) and the [Screeps Primer](../agents/SCREEPS_PRIMER.md).

## Multi-Agent Workflow

This project uses a durable multi-agent workflow for development and maintenance. If you are an agent or a contributor, your primary entry point should be [AGENTS.md](../../AGENTS.md) and the [Agent Workflow](../agent-workflow.md) guide.

### Key Components

- **World Model**: Persistent views of rooms, structures, and creeps.
- **CPU-Aware Plans**: Strategy passes that are throttled or skipped based on available CPU.
- **Task System**: Persistent tasks that rehydrate from `Memory` and drive creep behavior.
- **Automated Spawning**: Demand-driven spawn logic based on current tasks and room needs.

## Getting Started

If you are setting this up for the first time, proceed to the [Installation](installation.md) guide.

