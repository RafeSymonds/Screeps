# History

- 2026-03-17: Role initialized for orchestration. No completed tooling tasks recorded yet.
- 2026-03-17: Tightened headless operator docs to match `package.json`. Decision: keep npm aliases limited to `agent:roles`, `agent:queue`, and the dry-run `agent:process` wrapper; document `launch` and other subcommands through `python3 scripts/agent_manager.py ...`. Preserved the existing Screeps deploy command set and carried forward the known `test`/`lint` baseline caveat from `AGENTS.md`.
