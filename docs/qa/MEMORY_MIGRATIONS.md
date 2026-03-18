# Memory Migrations and Cleanup

This document defines when a `Memory` schema change in the Screeps AI requires an explicit migration note, a "bridge" in the code, or a manual cleanup step.

## Why this matters
- **Screeps Memory Limit**: `Memory` is limited to 2MB. Orphaned data ("bloat") from deleted features can eventually cause the AI to crash.
- **Cross-Tick Persistence**: Code changes are instant, but data persists. New code must be able to handle or clean up data written by old code.
- **Task Rehydration**: The `TaskManager` rehydrates objects from `Memory.tasks`. Breaking this schema can cause all active labor to be lost or orphaned.

---

## When a Migration/Cleanup is REQUIRED

### 1. Renaming or Deleting Keys
- **Rule**: If you delete or rename a key that exists in many objects (Creeps, Rooms, Intel), you must provide a cleanup script.
- **Reason**: To prevent memory bloat and stale data.
- **Example**: Renaming `RoomMemory.remoteMining` to `RoomMemory.remotes`.

### 2. Changing Data Types
- **Rule**: If a type change would cause a runtime crash (e.g., calling `.toFixed()` on a value that is now an object), you must implement a "bridge" or provide a cleanup script.
- **Reason**: Runtime stability.
- **Example**: Changing `intel.lastScouted` from `number` to `{ tick: number, version: string }`.

### 3. Moving Data Between Scopes
- **Rule**: If moving data that core logic depends on (e.g., from `CreepMemory` to `RoomMemory`), you must include a one-time migration or a clear warning.
- **Reason**: To avoid "forgetting" state that affects behavior (like ownership or assignments).

### 4. Structural Changes in `Memory.tasks`
- **Rule**: Renaming a `TaskKind` or adding a mandatory field to `TaskData` REQUIRES a migration note and/or a bridge in `TaskCreation.ts`.
- **Reason**: The `TaskManager` switch statement will fail to rehydrate tasks with unknown kinds, causing all active work to stop.

### 5. Retiring a Feature
- **Rule**: When removing a feature that wrote persistent data (e.g., an old scouting module), you must include a cleanup step.
- **Reason**: To prune keys that will never be updated again.

---

## Recommended Migration Strategies

### A. The "Bridge" (Preferred for Code)
Update the rehydration logic to handle both old and new formats for at least one release.
```typescript
// src/tasks/core/TaskCreation.ts
const kind = data.kind === "OLD_NAME" ? TaskKind.NEW_NAME : data.kind;
```

### B. The "Cleanup Snippet" (Preferred for Bloat)
Provide a JavaScript snippet in your task summary that the user can run in the Screeps console.
```javascript
// Example: Pruning old 'scoutInfo' key from all rooms
for (const name in Memory.rooms) { delete Memory.rooms[name].scoutInfo; }
```

### C. The "Main Bootstrap" (Preferred for Mandatory Moves)
Add a one-time block in `src/main.ts` that runs once and then can be removed.
```typescript
if (Memory.version < 2) {
    // perform migration...
    Memory.version = 2;
}
```

## How to Report
When completing a task that changes `Memory`, the `qa-reviewer` expects to see:
- [ ] **Schema Change**: Description of what changed.
- [ ] **Migration Path**: How existing data is handled (Bridge, Script, or "Safe to Reset").
- [ ] **Cleanup Command**: (If applicable) The console command to prune old keys.
