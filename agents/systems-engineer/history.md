# History

- 2026-03-18: Role initialized. Inherited script-side and infrastructure items from `operations-engineer`.
- 2026-03-17: Tightened headless operator docs to match `package.json`. Decision: keep npm aliases limited to `agent:roles`, `agent:queue`, and the dry-run `agent:process` wrapper; document `launch` and other subcommands through `python3 scripts/agent_manager.py ...`. Preserved the existing Screeps deploy command set and carried forward the known `test`/`lint` baseline caveat from `AGENTS.md`.
- 2026-03-17: Implemented script-side guardrails in `scripts/agent_manager.py` as requested by `technical-architect`. Added `HOT_PATHS` and `CORE_ROLES` constants, injected concurrency advisories and hot-path warnings into agent prompts, and added CLI warnings for parallel core-role execution. Updated `docs/agent-workflow.md` to document these guardrails.
