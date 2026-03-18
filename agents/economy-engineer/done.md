# Done

- `EE-QUEUE-01` Deterministic Spawn Request Normalization: Refactored `SpawnManager` to use a structured priority hierarchy, ensuring empty roles get emergency priority while avoiding pressure-smoothing lag for critical recovery.
- `EE-HAUL-01` Dynamic Local Hauling Requirements: Replaced hardcoded constants in `DeliverTask` with dynamic distance and room-throughput-share calculations initialized during `EconomyPlan`.
- `EE-REMOTE-02` Stable Remote Mining Lifecycle: Introduced `reserved` state for non-active remote candidates and added score hysteresis/stability bias to prevent tick-to-tick flip-flopping.

- 2026-03-18T19:27:52+00:00: technical-architect request, 2026-03-17: Refine the economy backlog into 2-4 bounded implementation slices. Needed outputs: - one candidate around spawn-demand tuning - one candidate around remote-mining state transitions - affected files and risk notes for each slice Constraint: - avoid proposing parallel tasks that both need to edit `src/spawner` or the same task-definition files
- 2026-03-18: technical-architect request, Formalizing ownership: You now own SpawnManager heuristics, body builders, and Economy/RemoteMining plans. Review docs/agent-workflow.md for the full ownership map.
- 2026-03-18: technical-architect request, Backlog Refactor: Refactor `backlog.md` into the four streams identified in `docs/architecture/ECONOMY_DECOMPOSITION.md`.
