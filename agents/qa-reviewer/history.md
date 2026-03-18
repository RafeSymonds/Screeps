# History

- 2026-03-17: Role initialized for orchestration. No completed QA reviews recorded yet.
- 2026-03-18: Created lightweight regression checklist for economy, spawning, and remote mining in docs/qa/REGRESSION_CHECKLIST.md. Targeted multi-tick failure modes and provided gating checks for projects with pre-existing test/lint failures.
- 2026-03-18: Defined Memory Migration Rules in docs/qa/MEMORY_MIGRATIONS.md at the request of the technical-architect. Integrated rules into AGENTS.md and docs/agent-workflow.md to ensure all roles provide cleanup scripts or bridges when changing persistent schemas.
- 2026-03-18: Completed high-risk review and implementation of `EE-QUEUE-02` (Unified Labor Scaling) in `src/spawner/SpawnManager.ts`. Introduced "starvation bonus" for haulers (triggered by low storage/energy) and "construction penalty" for workers (triggered by low energy/haulers) to prevent energy death spirals. Added corresponding safety checks to `docs/qa/REGRESSION_CHECKLIST.md`. Verified build passes.
- 2026-03-18: Updated `docs/SUMMARY.md` to include `REGRESSION_CHECKLIST.md`, `MEMORY_MIGRATIONS.md`, and `CROSS_TICK_BOUNDARIES.md` in the documentation index under a new "QA & Regression" section. Verified integration in `AGENTS.md` and `docs/agent-workflow.md`.
