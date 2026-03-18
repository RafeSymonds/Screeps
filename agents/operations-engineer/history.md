# History

- 2026-03-18: Implemented scouting prioritization for high-potential remotes (EE-REMOTE-05).
    - Added `priority` field to `ScoutTaskData`.
    - Updated `ScoutTask` assignment scoring to weight tasks by priority and intel freshness.
    - Enhanced `scoutFrontier` to boost priority for rooms within distance 2, rooms with 2+ sources, and unknown rooms.
    - Updated `ScoutingPlan` to ensure a minimum scouting radius of 2 for active colonies.
- 2026-03-18: Refined scouting and expansion pipeline.
    - Centralized expansion readiness logic into `RoomGrowth.ts` using a new `expansionReady` flag in `RoomMemory.growth`.
    - Updated `ExpansionPlan.ts` to consume the `expansionReady` signal.
    - Improved `ScoutingPlan.ts` to increase radius during expansion phases and prioritize scouting around potential new colony sites.
    - Optimized `RoomScouting.ts` to reduce redundant rescouting of keeper rooms and temporary hazards.
    - Verified that Strategy plans correctly rehydrate from `RoomMemory.intel`.
- 2026-03-18: Role refined to focus on Strategy, Intelligence, and Expansion. Previous script-side and infrastructure items moved to `systems-engineer`. Base Layout and Combat Strategy items moved to `base-specialist` and `combat-specialist`.
- 2026-03-17: (Items moved to systems-engineer, base-specialist, and combat-specialist during role refinement)
