# Agents Workspace

This directory holds the durable multi-agent workflow for this Screeps repository. For the full architectural and process guide, see [docs/agent-workflow.md](/Users/rafe/games/screeps/docs/agent-workflow.md).

## Folder Structure

- `orchestrator.md`: shared entrypoint instructions for any role session.
- `task-board.md`: cross-role shared queue for work that is ready now or blocked.
- `*/role.md`: the role's scope, constraints, and deliverables.
- `*/backlog.md`: role-local work that is not currently assigned elsewhere.
- `*/history.md`: role-local memory of decisions, assumptions, and follow-ups.
- `*/inbox.md`: active requests from other roles.
- `*/done.md`: archived completed inbox items.
- `*/artifacts/`: role-local outputs that do not belong in shared docs or source files.

## Work Assignment and Priority

The agent manager resolves work automatically according to the priority defined in [docs/agent-workflow.md](/Users/rafe/games/screeps/docs/agent-workflow.md#queue-resolution-order). The default order is:
1. `agents/<role>/inbox.md`
2. `agents/task-board.md` (`## Ready now`)
3. `agents/<role>/backlog.md`

## Parallelism and Safety

- Different roles may run concurrently; use `--no-auto-commit` in this case.
- Avoid overlapping ownership in hot paths: `src/plans`, `src/tasks`, `src/spawner`, and `src/main.ts`.
- See the full list of [Screeps-specific guardrails](/Users/rafe/games/screeps/docs/agent-workflow.md#screeps-specific-guardrails) for safety rules.

## Example Commands

`package.json` wraps the most common headless commands:

```bash
npm run agent:roles
npm run agent:queue
npm run agent:process
```

Use the direct Python entrypoint for more granular control:

```bash
python3 scripts/agent_manager.py queue --session remote-mining-20260317-abc123
python3 scripts/agent_manager.py launch economy-engineer --auto --dry-run
python3 scripts/agent_manager.py launch documentation-owner --file docs/agent-workflow.md --dry-run
python3 scripts/agent_manager.py inbox draft economy-engineer qa-reviewer "Review the hauling regression risk for remote mining saturation changes."
```
