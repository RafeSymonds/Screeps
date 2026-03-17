# Agent Workflow

This repository includes a durable multi-agent workflow built around role folders under `agents/` and the headless runner in `scripts/agent_manager.py`.

## Purpose

The workflow is designed to:

- keep role scope explicit
- preserve local memory across sessions
- let agents hand work to each other through auditable inbox files
- support headless execution with persistent run logs
- prevent two tasks for the same role from running at the same time

## Shared truth versus local memory

- `docs/` and source files hold shared project truth.
- `agents/<role>/history.md` holds role-local memory.
- `agents/<role>/inbox.md` holds active cross-role requests.
- `agents/<role>/done.md` archives completed inbox requests.
- `.agent-manager/` holds session state, locks, prompts, and run logs.

## Queue resolution

The manager resolves work in this order:

1. first live inbox item for the role
2. `agents/task-board.md` item in `## Ready now`
3. first live backlog item for the role

## Screeps-specific guardrails

- Read `AGENTS.md`, `docs/agents/REPO_MAP.md`, and `docs/agents/SCREEPS_PRIMER.md` before changing behavior.
- Trace changes through `Memory`, planning, spawning, task assignment, and creep execution.
- Prefer small, ownership-aligned edits.
- Treat `src/main.ts`, `src/plans`, `src/tasks`, and `src/spawner` as high-conflict areas for parallel work.
- When a task touches persistent memory or planner sequencing, involve `technical-architect` and `qa-reviewer`.

## Roles

- `technical-architect`: tick-pipeline boundaries, shared contracts, and decomposition.
- `economy-engineer`: economy, spawning, hauling, remote mining, and room-growth throughput.
- `operations-engineer`: tooling, orchestration, build and deploy workflows.
- `qa-reviewer`: regression review, validation plans, and release-risk notes.
- `documentation-owner`: shared workflow, onboarding, and architecture docs.

## Common commands

```bash
python3 scripts/agent_manager.py roles
python3 scripts/agent_manager.py queue
python3 scripts/agent_manager.py pick economy-engineer
python3 scripts/agent_manager.py assign economy-engineer --auto
python3 scripts/agent_manager.py launch economy-engineer --dry-run
python3 scripts/agent_manager.py process --max-parallel 2 --no-auto-commit --dry-run
python3 scripts/agent_manager.py session new --name spawn-tuning
python3 scripts/agent_manager.py session status
python3 scripts/agent_manager.py inbox draft technical-architect qa-reviewer "Review the regression risk for this Memory schema change."
```

## Notes on commits and parallelism

- Single-role runs may use auto-commit when the worktree is cleanly isolated.
- Parallel processing should use `--no-auto-commit`.
- The script defaults to no auto-commit when invoked without an explicit subcommand.
