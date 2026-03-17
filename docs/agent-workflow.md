# Agent Workflow

This repository includes a durable multi-agent workflow built around role folders under `agents/` and the headless runner in `scripts/agent_manager.py`.

## Purpose

The workflow is designed to:

- keep role scope explicit
- preserve local memory across sessions
- let agents hand work to each other through auditable inbox files
- support headless execution with persistent run logs
- prevent two tasks for the same role from running at the same time
- keep shared docs synchronized with the custom Screeps runtime instead of the upstream starter defaults

## Shared truth versus local memory

- `docs/` and source files hold shared project truth.
- `README.md` and `AGENTS.md` are part of the shared onboarding surface and should stay aligned with current runtime behavior and commands.
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
- Trace changes through `Memory`, plan scheduling, spawning, task assignment, tower behavior, and creep execution.
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

`package.json` currently exposes only these npm aliases for headless role work:

```bash
npm run agent:roles
npm run agent:queue
npm run agent:process
```

Use the direct Python entrypoint for the rest of the manager surface such as `launch`, `assign`, `pick`, `session`, and `inbox`.

```bash
python3 scripts/agent_manager.py roles
python3 scripts/agent_manager.py queue
python3 scripts/agent_manager.py queue --session spawn-tuning-20260317-abc123
python3 scripts/agent_manager.py pick economy-engineer
python3 scripts/agent_manager.py assign economy-engineer --auto
python3 scripts/agent_manager.py launch economy-engineer --dry-run
python3 scripts/agent_manager.py launch operations-engineer --auto --dry-run
python3 scripts/agent_manager.py launch documentation-owner --file docs/agents/REPO_MAP.md --dry-run
python3 scripts/agent_manager.py process --max-parallel 2 --no-auto-commit --dry-run
python3 scripts/agent_manager.py process --roles documentation-owner qa-reviewer --max-parallel 2 --no-auto-commit --dry-run
python3 scripts/agent_manager.py session new --name spawn-tuning
python3 scripts/agent_manager.py session status
python3 scripts/agent_manager.py inbox draft technical-architect qa-reviewer "Review the regression risk for this Memory schema change."
```

## Operator workflow

1. Build or refresh the session queue with `python3 scripts/agent_manager.py queue` or `npm run agent:queue`.
2. Inspect or adjust role assignments with `pick`, `assign`, or `session status` when the auto-resolved task is not what you want.
3. Dry-run a single role with `python3 scripts/agent_manager.py launch <role> --auto --dry-run` before a live launch when you need to verify prompt assembly or extra `--file` context.
4. Use `python3 scripts/agent_manager.py process --max-parallel 2 --no-auto-commit --dry-run` to rehearse a multi-role run without invoking the provider CLIs.
5. Remove `--dry-run` only after you are satisfied with the queued work, provider choice, and file context.

## Notes on commits and parallelism

- Single-role runs may use auto-commit when the worktree is cleanly isolated.
- Parallel processing should use `--no-auto-commit`.
- The script defaults to no auto-commit when invoked without an explicit subcommand.
- `process` and `launch` take optional `--provider`, `--model`, and repeated `--file` arguments; use `--file` to force extra repo-relative context into the startup read list when the task depends on it.
- Inbox-originated work is automatically archived from `inbox.md` to `done.md` after a successful non-dry-run headless execution.
- Keep the repo-level command expectations aligned with `package.json`: today that means `agent:roles`, `agent:queue`, and a dry-run `agent:process` alias, while `launch` remains a direct `python3 scripts/agent_manager.py ...` command.
- Do not treat `npm run test` or `npm run lint` as clean gating checks for headless agent sessions. `AGENTS.md` is the source of truth for the current baseline.
