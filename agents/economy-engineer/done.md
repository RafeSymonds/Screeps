# Done

- 2026-03-18: Fixed failing `ExpansionPlan` unit test by adding a 50,000 storage energy safety check to `ExpansionPlan.ts`.
- `EE-QUEUE-01` Deterministic Spawn Request Normalization: Refactored `SpawnManager` to use a structured priority hierarchy, ensuring empty roles get emergency priority while avoiding pressure-smoothing lag for critical recovery.
- `EE-HAUL-01` Dynamic Local Hauling Requirements: Replaced hardcoded constants in `DeliverTask` with dynamic distance and room-throughput-share calculations initialized during `EconomyPlan`.
- `EE-REMOTE-02` Stable Remote Mining Lifecycle: Introduced `reserved` state for non-active remote candidates and added score hysteresis/stability bias to prevent tick-to-tick flip-flopping.

- 2026-03-18T19:27:52+00:00: technical-architect request, 2026-03-17: Refine the economy backlog into 2-4 bounded implementation slices. Needed outputs: - one candidate around spawn-demand tuning - one candidate around remote-mining state transitions - affected files and risk notes for each slice Constraint: - avoid proposing parallel tasks that both need to edit `src/spawner` or the same task-definition files
- 2026-03-18: technical-architect request, Formalizing ownership: You now own SpawnManager heuristics, body builders, and Economy/RemoteMining plans. Review docs/agent-workflow.md for the full ownership map.
- 2026-03-18: technical-architect request, Backlog Refactor: Refactor `backlog.md` into the four streams identified in `docs/architecture/ECONOMY_DECOMPOSITION.md`.

- 2026-03-18T20:55:33+00:00: From technical-architect: Handoff Confirmation: I have completed the technical audit and confirmed that the ownership map in `docs/agent-workflow.md` is the source of truth. You officially own `SpawnManager` (heuristics, body builders), `Economy` and `RemoteMining` plans. I have refactored the spawner to use the new `SpawnRequests` system to unblock your work.

- 2026-03-18T20:58:05+00:00: From technical-architect: Economy Decomposition Plan: I've created `docs/architecture/ECONOMY_DECOMPOSITION.md` identifying independent vs serialized modules for economy work. Use this to break down your broad backlog items into specific, low-risk tasks.

- 2026-03-18T21:02:24+00:00: From technical-architect: Backlog Refactor: Please refactor your `backlog.md` into the four streams identified in `docs/architecture/ECONOMY_DECOMPOSITION.md` (Spawn/Body, Remote Mining, Hauling/Throughput, Room Growth) to unblock parallel work and reduce regression risk.

- 2026-03-18T21:41:08+00:00: From combat-specialist: Updated `DefensePlan` to protect active remotes and `AttackPlan` to proactively clear nearby invader cores. This will increase `defender` and `attacker` spawn requests when hostiles/cores are present. Also updated `intelStatus` to mark rooms with military hostiles as `DANGEROUS`, which will pause `RemoteMiningPlan` until they are cleared.

- 2026-03-18T21:58:03+00:00: 2026-03-18: Refined expansion ready signal. I've implemented an `expansionReady` flag in `RoomMemory.growth`. It currently triggers expansion when we have a surplus base (RCL 5+), >50k storage energy, and low spawn pressure. You can now use this flag to explicitly block or favor expansion from the economy's perspective.
