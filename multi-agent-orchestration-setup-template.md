# Multi-Agent Orchestration Setup Template

Use this template to add a durable multi-agent workflow to any software project, not just game development.

## Goals

- give each agent a clear scope and durable local memory
- let agents hand work to each other without sharing one giant context window
- support headless execution through a CLI runner
- allow multiple different agents to run at once
- never allow two tasks for the same agent at the same time
- keep cross-agent communication explicit and auditable
- preserve completed requests without leaving them in the live queue

## Recommended Repo Layout

```text
your-project/
  docs/
    agent-workflow.md
    multi-agent-orchestration-setup-template.md
  agents/
    README.md
    orchestrator.md
    task-board.md
    <role-a>/
      role.md
      backlog.md
      history.md
      inbox.md
      done.md
      artifacts/
        README.md
    <role-b>/
      role.md
      backlog.md
      history.md
      inbox.md
      done.md
      artifacts/
        README.md
  scripts/
    agent_manager.py
```

## Core Concepts

### 1. Durable role folders

Each agent gets its own folder under `agents/<role>/`.

Required files:

- `role.md`: mission, ownership, constraints, deliverables
- `backlog.md`: role-local tasks that are not yet assigned elsewhere
- `history.md`: timeline of completed work, decisions, assumptions, and follow-ups
- `inbox.md`: active requests from other agents
- `done.md`: archived completed inbox requests
- `artifacts/README.md`: where that role stores outputs that do not belong in shared docs or source files

### 2. Shared truths versus local memory

Use these boundaries consistently:

- `docs/`: shared design, architecture, policy, process, product truth
- source directories: real implementation owned by the project
- `agents/<role>/history.md`: role-local memory
- `agents/<role>/inbox.md`: actionable requests from other roles
- `agents/<role>/done.md`: completed cross-agent requests archive

### 3. Explicit communication

Agents should not casually edit another agent's history.

Use communication channels like this:

- request work from another role by appending a bullet to that role's `inbox.md`
- keep the request concrete, with outputs, constraints, and blocking reason
- when completed successfully, remove the item from `inbox.md` and append it to `done.md`

Example inbox item:

```md
- api-engineer request, 2026-03-17:
  Add a paginated `GET /reports` endpoint.
  Needed outputs:
  - route and handler
  - query validation
  - response schema
  Constraint:
  - preserve existing filter semantics
```

Example done entry:

```md
- 2026-03-17T21:02:15+00:00: api-engineer request, 2026-03-17: Add a paginated `GET /reports` endpoint. Needed outputs: - route and handler - query validation - response schema Constraint: - preserve existing filter semantics
```

## Queue Resolution Rules

The scheduler should resolve work in this order:

1. first unchecked live inbox item for the role
2. shared `agents/task-board.md` ready-now item for the role
3. first backlog item for the role

That priority keeps direct handoffs ahead of generic background work.

## Per-Role Files

### `agents/orchestrator.md`

This is the common entrypoint prompt for any role session.

It should tell the agent to read, in order:

1. project `README.md`
2. `agents/orchestrator.md`
3. its own `role.md`
4. its own `backlog.md`
5. its own `history.md`
6. any explicitly provided extra files

It should also enforce:

- stay inside scope
- put shared truth in `docs/` or source files, not only in local notes
- do not overwrite another role's `history.md`
- draft concrete inbox handoffs when another role is required
- end with a concise completion summary

### `agents/task-board.md`

Use a shared board with sections like:

- `## Ready now`
- `## Blocked by ...`
- `## Already decided`

In `## Ready now`, use one bullet per role:

```md
- backend-engineer: implement the session token refresh flow
  Deliverable: add refresh endpoint, service wiring, and integration tests.
  Unblocks: frontend login persistence and mobile auth parity.
```

### `agents/README.md`

Document:

- folder meanings
- queue resolution order
- session behavior
- provider backends
- parallelism rules
- inbox/done communication model
- example commands

## Generic Role Set

Adapt these to the project, but this is a good default for software work:

- `product-owner`: requirements, scope, acceptance criteria
- `technical-architect`: system boundaries, runtime contracts, sequencing
- `backend-engineer`: APIs, services, persistence, jobs
- `frontend-engineer`: UI implementation and client state
- `qa-reviewer`: test plans, regression review, release-readiness
- `data-engineer`: schemas, pipelines, analytics, migrations
- `devops-engineer`: CI/CD, infra, deploy, observability
- `documentation-owner`: onboarding, runbooks, public/internal docs

If the project is small, combine roles. If the project is large, split them further.

## Orchestrator Script Requirements

Your `scripts/agent_manager.py` equivalent should support:

- discovering roles from `agents/*/role.md`
- creating and tracking named sessions
- assigning one active task per role per session
- building a prompt from shared and role-local files
- launching a provider CLI headlessly
- recording prompt, output, stream log, and metadata under `.agent-manager/`
- auto-queueing from inbox/task-board/backlog
- processing multiple distinct roles concurrently
- preventing overlap for the same role
- consuming completed inbox items into `done.md`

## Required Runtime Behavior

### Session state

Store state in a file such as:

```text
.agent-manager/state.json
```

Track:

- current session id
- session creation time
- per-role assignment
- assignment source
- status: `queued`, `running`, `completed`, `failed`, `dry-run`
- last launch time
- last run metadata

### Run logs

Store each role run under:

```text
.agent-manager/runs/<session>/<role>/
```

Recommended files:

- `prompt.txt`
- `output.txt`
- `stream.log`
- `meta.json`

### Role locks

Use lock files under:

```text
.agent-manager/locks/<role>.lock
```

Rules:

- if a lock exists, do not start another task for that role
- lock should include session id, pid, and timestamp
- always clean it up on exit

This is what guarantees "never tasks from same agent at once".

## Parallelism Rules

Allow:

- different roles running at the same time

Do not allow:

- two runs for the same role at the same time

Recommended CLI flag:

```bash
python3 scripts/agent_manager.py process --max-parallel 3 --no-auto-commit
```

Important rule:

- if parallel runs can edit the same repo, disable automatic git commit during that batch unless you have stronger isolation

## Inbox and Done Behavior

Use this exact model:

- `inbox.md` contains only live actionable requests
- on successful completion of an inbox-sourced task:
  - remove that exact request from `inbox.md`
  - append it with a timestamp to `done.md`
- if the same role still has another inbox item, re-queue that role in the same `process` run
- `--dry-run` must not mutate inbox/done files
- failed tasks must stay in `inbox.md`

That gives you:

- clean active queues
- durable audit trail
- no duplicate execution of completed requests

## Minimal Command Set

Your manager should expose commands like:

```bash
python3 scripts/agent_manager.py roles
python3 scripts/agent_manager.py queue
python3 scripts/agent_manager.py pick backend-engineer
python3 scripts/agent_manager.py assign backend-engineer --auto
python3 scripts/agent_manager.py launch backend-engineer
python3 scripts/agent_manager.py process --max-parallel 2 --no-auto-commit
python3 scripts/agent_manager.py session new --name feature-x
python3 scripts/agent_manager.py session status
python3 scripts/agent_manager.py inbox draft backend-engineer frontend-engineer "Need client payload shape for report filters."
```

## Suggested Prompt Contract

Every launched role should receive a prompt equivalent to:

```text
You are the <role> agent for this workspace.

Primary working directory: agents/<role>
Shared repo root: <repo-root>

Start by reading these files in order:
- README.md
- agents/orchestrator.md
- agents/<role>/role.md
- agents/<role>/backlog.md
- agents/<role>/history.md

After that, consult docs/, source files, data files, and other agent inboxes only when the task requires them.

Task for this session:
<resolved task>

Required behavior:
- Work the task end to end.
- Treat your role folder as durable working memory.
- Put shared truth in docs/ or source files when needed.
- Do not overwrite another role's history.
- If another role is needed, draft a concrete inbox request.
- End with a concise completion summary.
```

## Generic Bootstrap Steps

To apply this system to a new project:

1. Create `agents/`, `docs/`, and `scripts/agent_manager.py`.
2. Add `agents/orchestrator.md`.
3. Add `agents/task-board.md`.
4. Create role folders with `role.md`, `backlog.md`, `history.md`, `inbox.md`, `done.md`, and `artifacts/README.md`.
5. Document the workflow in `agents/README.md` and `docs/agent-workflow.md`.
6. Implement the manager behaviors described above.
7. Dry-run `queue` and `process` before using live provider execution.
8. Start with `--max-parallel 1`, then increase after lock behavior is verified.

## Recommended Conventions

### `inbox.md`

```md
# Inbox

- none
```

### `done.md`

```md
# Done
```

### `history.md`

```md
# History

## 2026-03-17

- Role folder created.
- Initial scope defined.
```

### `backlog.md`

```md
# Backlog

- first role-local task
- second role-local task
```

## Practical Notes

- Keep role scopes real. A role without clear ownership will create duplicate or conflicting work.
- Keep inbox requests concrete. Vague requests produce vague outcomes.
- Do not use inboxes as general chat. They are a work queue, not a discussion log.
- Preserve shared truth in normal project files, not only agent-local notes.
- Treat `done.md` as an audit log, not a second backlog.
- If a role's backlog items are all stale, rewrite the backlog instead of letting it drift forever.

## Copy Checklist

When cloning this pattern into another repo, copy or recreate:

- `docs/agent-workflow.md`
- `agents/README.md`
- `agents/orchestrator.md`
- `agents/task-board.md`
- all role folders with `role.md`, `backlog.md`, `history.md`, `inbox.md`, `done.md`
- `scripts/agent_manager.py`

## This Project's Key Decisions Worth Reusing

- different agents may run concurrently
- the same agent may not run two tasks at once
- inbox items are first-class queued work
- completed inbox items leave `inbox.md` and move to `done.md`
- stale completed assignments may be refreshed automatically when newer inbox work appears
- one process run may drain multiple inbox items for the same role, one at a time
- role lock files are the real concurrency guard, not only session state
