# Agents Workspace

This directory holds the durable multi-agent workflow for this Screeps repository.

## Folder meanings

- `orchestrator.md`: shared entrypoint instructions for any role session.
- `task-board.md`: cross-role shared queue for work that is ready now or blocked.
- `*/role.md`: the role's scope, constraints, and deliverables.
- `*/backlog.md`: role-local work that is not currently assigned elsewhere.
- `*/history.md`: role-local memory of decisions, assumptions, and follow-ups.
- `*/inbox.md`: active requests from other roles.
- `*/done.md`: archived completed inbox items.
- `*/artifacts/`: role-local outputs that do not belong in shared docs or source files.

## Queue resolution order

The agent manager resolves work in this order:

1. first live item in `agents/<role>/inbox.md`
2. matching `## Ready now` item in `agents/task-board.md`
3. first live item in `agents/<role>/backlog.md`

That keeps direct handoffs ahead of background work.

## Session behavior

- Session state is stored in `.agent-manager/state.json`.
- Per-run logs are stored under `.agent-manager/runs/<session>/<role>/`.
- Only one active task is allowed for a role in a given session.
- Inbox items are archived into `done.md` after a successful role run that originated from inbox work.

## Provider backends

- `codex`: preferred when available locally.
- `claude`: fallback if installed and configured.
- `auto`: choose `codex` first, then `claude`.

## Parallelism rules

- Different roles may run at the same time.
- The same role must never run twice at once.
- Use `--no-auto-commit` when processing multiple roles in parallel.
- For this repo, parallel runs should avoid overlapping ownership in hot paths like `src/plans`, `src/tasks`, `src/spawner`, and `src/main.ts`.

## Inbox and done model

- Request work from another role by appending a concrete bullet to that role's `inbox.md`.
- Include the needed output, constraint, and blocking reason when relevant.
- The receiving role should not edit the sender's local memory files.

## Example commands

```bash
python3 scripts/agent_manager.py roles
python3 scripts/agent_manager.py queue
python3 scripts/agent_manager.py session new --name remote-mining
python3 scripts/agent_manager.py assign economy-engineer --auto
python3 scripts/agent_manager.py launch economy-engineer --dry-run
python3 scripts/agent_manager.py process --max-parallel 2 --no-auto-commit --dry-run
python3 scripts/agent_manager.py inbox draft economy-engineer qa-reviewer "Review the hauling regression risk for remote mining saturation changes."
```
