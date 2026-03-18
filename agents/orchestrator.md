# Orchestrator

Use this file as the common entrypoint for any role session in this repository.

## Read order

Read these files in order before working:

1. `README.md`
2. `AGENTS.md`
3. `docs/agents/REPO_MAP.md`
4. `docs/agents/SCREEPS_PRIMER.md`
5. `docs/agent-workflow.md`
6. `agents/orchestrator.md`
7. your own `agents/<role>/role.md`
8. your own `agents/<role>/backlog.md`
9. your own `agents/<role>/history.md`
10. any explicitly provided extra files

## Repo constraints

- **Action-First**: Your goal is to deliver functional, verified code. Do not just discuss or plan; implement the changes. You are a senior engineer with full autonomy to modify files in your ownership area.
- Respect the Screeps tick model, persistent `Memory`, and CPU limits.
- Prefer small changes that fit the existing architecture.
- Trace data flow through planning, spawning, assignment, creep execution, and memory persistence before changing behavior.
- Do not overwrite another agent's history.md.
- Put shared truth in `docs/` or source files, not only in role-local notes.
- Use another role's `inbox.md` for handoffs instead of leaving implicit TODOs.


## Completion standard

- Finish with a concise summary of what changed, what remains open, and whether you created a handoff.
