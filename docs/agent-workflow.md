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

## Session State and Storage

The orchestration manager maintains state in these locations:

- **State File**: `.agent-manager/state.json` tracks the current session name, active assignments, and completion status.
- **Locks**: `.agent-manager/locks/` prevents parallel runs for the same role.
- **Logs**: `.agent-manager/runs/<session>/<role>/` contains full prompt transcripts and tool outputs for every execution.
- **Work Area**: `agents/<role>/` is where the role's working files (backlog, history, inbox) live.

## Queue Resolution Order

The manager resolves work automatically in this priority:

1. **Inbox**: the first live item in `agents/<role>/inbox.md`.
2. **Task Board**: a matching `## Ready now` item in `agents/task-board.md`.
3. **Backlog**: the first live item in `agents/<role>/backlog.md`.

This order ensures that direct handoffs from other roles are handled before general project tasks or background backlog work.

## Safe Defaults and Behavior

- **One Task per Role**: Only one active task is allowed for a role in a given session.
- **Inbox Archiving**: Items are automatically moved from `inbox.md` to `done.md` after a successful non-dry-run execution.
- **Provider Choice**: Defaults to `auto` (preferring `gemini`, then `codex` if available locally, falling back to `claude`).
- **Context Injection**: Use `--file <path>` repeatedly during `launch` or `process` to force extra repo-relative context into the session.
- **Commits**: Multi-role `process` runs default to `--no-auto-commit`. Single-role runs should use `--dry-run` until the plan is verified.

## Provider Backends

- **gemini**: preferred for all tasks; runs with absolute path awareness.
- **codex**: alternate for local development and high-volume tasks.
- **claude**: fallback for complex reasoning or when other providers are unavailable.
- **auto**: automatic selection (Gemini first, then Codex, then Claude).

## Screeps-specific guardrails
- Read `AGENTS.md`, `docs/agents/REPO_MAP.md`, and `docs/agents/SCREEPS_PRIMER.md` before changing behavior.
- **Review Checklist**: Use the [Shared Review Checklist](qa/REVIEW_CHECKLIST.md) for changes affecting `Memory`, spawning, remotes, or deployment. For surgical economy or memory changes, use the [Lightweight Regression Checklist](qa/REGRESSION_CHECKLIST.md).
- **Lightweight Checklist Summary**:
    - **Memory**: Ambient types updated? Migration/cleanup needed? Stale data pruning?
    - **Balance**: 300 energy bootstrap possible? Task demand reported? Priority inversions?
    - **Remotes**: Route length in formula? Safety interlocks? Visibility handling?
    - **CPU**: O(n) loops avoided? Caching used? Throttling respected?
- Trace changes through `Memory`, plan scheduling, spawning, task assignment, tower behavior, and creep execution.
- Prefer small, ownership-aligned edits.
- Treat `src/main.ts`, `src/plans`, `src/tasks`, and `src/spawner` as high-conflict areas for parallel work.
- **Script-Side Guardrails**: The `agent_manager.py` script will warn when multiple core roles (`technical-architect`, `economy-engineer`, `operations-engineer`) are run in parallel. Agent prompts also include concurrency advisories and hot-path warnings when multi-role sessions are active.
- When a task touches persistent memory or planner sequencing, involve `technical-architect` and `qa-reviewer`.

## Roles and Ownership

Specific file-level ownership ensures that agents do not introduce conflicting logic or break implicit cross-tick contracts. For a detailed map of state boundaries and risks, see [docs/qa/CROSS_TICK_BOUNDARIES.md](/docs/qa/CROSS_TICK_BOUNDARIES.md).

- **technical-architect**:
    - **Core Loop**: `src/main.ts` (tick pipeline, top-level `Memory` schema).
    - **Planning Core**: `src/plans/core/` (ordering, scheduling, intervals).
    - **Task Core**: `src/tasks/core/` (rehydration, assignment, pruning logic).
    - **World Model**: `src/world/` (shared views).
- **economy-engineer**:
    - **Economy Plans**: `src/plans/definitions/` (`EconomyPlan`, `LinkPlan`, `RemoteMiningPlan`, `SupportPlan`).
    - **Spawning**: `src/spawner/` (heuristics, body builders, pressure logic).
    - **Economy Tasks**: `src/tasks/definitions/` (`HarvestTask`, `DeliverTask`, `RemoteHarvestTask`, etc.).
    - **Economy Memory**: `RoomMemory.remoteMining`, `RoomMemory.spawnStats`, `RoomMemory.supportRequest`.
- **operations-engineer**:
    - **Strategy & Expansion**: `src/plans/definitions/` (`ScoutingPlan`, `ExpansionPlan`).
    - **Intelligence**: `src/rooms/` (RoomIntel, Scouting, InterRoomRouter).
    - **Expansion Tasks**: `src/tasks/definitions/` (`ScoutTask`, `ClaimTask`).
    - **Intelligence Memory**: `RoomMemory.intel`.
- **combat-specialist**:
    - **Military Strategy**: `src/plans/definitions/` (`AttackPlan`, `DefensePlan`, `ReservationPlan`).
    - **Tactical Logic**: `src/combat/` (Tower defense, combat movement, healing/attacking utils).
    - **Military Tasks**: `src/tasks/definitions/` (`AttackTask`, `CombatTask`, `ReserveTask`).
    - **Combat Memory**: `RoomMemory.combat`, `CreepMemory.combat`.
- **base-specialist**:
    - **Infrastructure Planning**: `src/plans/definitions/` (`InfrastructurePlan`, `BasePlan`).
    - **Base Topology**: `src/basePlaner/` (Anchor selection, road planning).
    - **Construction Tasks**: `src/tasks/definitions/` (`BuildTask`, `RepairTask`).
    - **Base Memory**: `RoomMemory.basePlan`, `RoomMemory.topology`.
- **systems-engineer**:
    - **Tooling & Build**: `rollup.config.js`, `package.json`, `tsconfig.json`.
    - **Scripts**: `scripts/`, deployment tools, `agent_manager.py`.
    - **Infrastructure**: `.agent-manager/`.
    - **Repository Health**: Lint debt, testing, CI/CD.
- **qa-reviewer**:
    - **Validation**: release-risk notes, validation plans, regression review.
- **documentation-owner**:
    - **Shared Docs**: `docs/`, `README.md`, `AGENTS.md`.

## Architectural Ownership and Escalation

Because the Screeps runtime is cross-tick and CPU-throttled, certain changes have high ripple effects. Follow these escalation rules:

### 1. Memory Schema Changes
Any change to the ambient `Memory`, `CreepMemory`, or `RoomMemory` interfaces in `src/main.ts` must be reviewed by the **technical-architect**. These are global contracts that affect every subsystem.

**Important**: All schema changes MUST adhere to the [Memory Migration Rules](/docs/qa/MEMORY_MIGRATIONS.md) to prevent runtime crashes or persistent memory bloat. If you change a key or type, you are responsible for providing a cleanup snippet or a "bridge" in the code.

### 2. Plan Scheduling
Modifying plan intervals or priorities in `src/plans/core/PlanManager.ts` or `PlanScheduler.ts` requires **technical-architect** review. Throttling changes can cause stale state in dependent plans (e.g., `SpawnManager` relying on tasks from a skipped `RemoteMiningPlan`). See [docs/qa/CROSS_TICK_BOUNDARIES.md](/docs/qa/CROSS_TICK_BOUNDARIES.md) for a map of these dependencies.

### 3. Task Lifecycle & Spawning
If you add a new `TaskKind` or modify `TaskRequirements`, you must verify the impact on the `SpawnManager` demand calculation. Significant changes to labor requirements should be reviewed by both the **economy-engineer** (for spawn pressure) and the **technical-architect** (for assignment logic).

### 4. Inter-Room Resource Allocation
Changes to `RoomMemory.supportRequest` or `SupportPlan` logic that affect how energy is moved between rooms must be reviewed by the **economy-engineer**.

### 5. Cross-Tick State Implicit Contracts
Plans that read state from `RoomMemory` set by other plans must:
- Check for existence of the data (plans may be throttled).
- Verify data freshness via `lastEvaluated` or `lastScouted` timestamps if available.
- Default to safe, conservative behavior if the expected state is missing.
- See [docs/qa/CROSS_TICK_BOUNDARIES.md](/docs/qa/CROSS_TICK_BOUNDARIES.md) for the map of shared state.

### 6. Multi-Agent Conflict Resolution
If a task requires changes in another agent's primary ownership area, use the `inbox draft` command to hand off the specific sub-task or request a review. Do not perform "drive-by" edits on core heuristics owned by another role.

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
