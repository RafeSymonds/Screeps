# Design Doc: Feature Gap Analysis

## Comparing The International Open Source Bot vs Our Screeps AI

---

## Executive Summary

The International (TI) bot is a mature, well-documented open source Screeps AI with comprehensive features. Our bot (`/Users/rafe/games/screeps`) has a solid foundation but is missing many features that TI has already implemented. This document outlines those gaps to guide future development.

---

## 1. Architecture & Design Patterns

### TI's Data-Oriented Architecture

TI follows strict data-oriented design with six categories:

| Category | State | Input    | Purpose                              |
| -------- | ----- | -------- | ------------------------------------ |
| Utils    | No    | Singular | Query/calculation helpers            |
| Procs    | No    | Singular | Run logic on single input            |
| Ops      | No    | Singular | Run logic, sometimes retrieve values |
| Services | No    | Plural   | Run procs/utils over collections     |
| Manager  | Yes   | Varies   | Combined state + logic (avoided)     |
| Data     | Yes   | N/A      | Pure state objects                   |

### Our Architecture

Our bot uses:

- Plan-based system (`plans/definitions/`)
- Task system (`tasks/definitions/`)
- World/WorldRoom objects
- Mixed OOP with some managers

**Gap**: We don't have the same strict separation of concerns. Our `SpawnManager.ts` is a 1000+ line monolith that tries to do everything.

---

## 2. Layer 1: International Requests (Inter-Room Coordination)

### TI's System

TI has formal request types stored in global `Memory`:

| Request Type  | Memory Key                        | Purpose                           |
| ------------- | --------------------------------- | --------------------------------- |
| WorkRequest   | `Memory.workRequests[roomName]`   | Claim and develop unclaimed rooms |
| CombatRequest | `Memory.combatRequests[roomName]` | Attack or defend rooms            |
| HaulRequest   | `Memory.haulRequests[roomName]`   | Transport resources between rooms |

Each has a full lifecycle: Created → Unassigned → Assigned → Creeps spawned → Completed/Deleted

### Our System

We have:

- `ExpansionPlan` - handles room expansion (similar to WorkRequest)
- `DefensePlan` - defensive operations
- `SupportPlan` - bootstrapping support between rooms
- `TerminalPlan` - energy balancing via terminals

**Gap**: We don't have formal `HaulRequest` system for dedicated resource transport between rooms. TerminalPlan only handles energy, not other minerals/resources in a coordinated way.

---

## 3. Layer 2: Spawn Request System

### TI's Spawn System

**File**: `src/room/commune/spawning/spawnRequests.ts`

TI generates spawn requests in strict priority order:

```
sourceHarvester()        // Priority ~0-1
haulerForCommune()       // Priority ~0.5
remoteSourceRoles()      // Priority ~9+ (per remote, by efficacy)
generalRemoteRoles()     // Priority ~9+ (reservers, core attackers)
mineralHarvester()       // Priority ~10+
hubHauler()              // Priority ~7
fastFiller()             // Priority ~0.75-1.25
defenders()              // Priority ~6-8
maintainers()            // Priority ~6-9
builders()               // Priority ~9+
controllerUpgraders()    // Priority ~5 (desperate) or ~9+
scout()                  // Priority ~9+
workRequestRoles()       // Priority ~8.1-8.2
requestHauler()          // Priority ~0.5-8
antifa()                 // Priority ~9
```

**Body Construction**: Uses templates with:

- `defaultParts`: Always included
- `extraParts`: Repeated up to `partsMultiplier`, constrained by energy
- Energy tier breakpoints (550, 600, 750, 800, 850)

**Request Types**:

```typescript
enum SpawnRequestTypes {
    individualUniform, // Each creep same body (1 per source)
    groupDiverse, // Pool sharing total parts requirements
    groupUniform // Pool with same body, filling parts quota
}
```

### Our Spawn System

Our `SpawnManager.ts` is a single large file with complex logic:

- `spawnOneCreep()` - main spawn logic
- Priority-based boost system for onboarding/support
- `hasMinerBaseline()`, `hasHaulerBaseline()`, `hasWorkerBaseline()`
- `minerBody()`, `haulerBody()`, `workerBody()` - body builders

**Gap**: We don't have:

- Formal priority-ordered spawn request generation
- Energy tier breakpoints for body scaling
- `groupDiverse` or `groupUniform` spawn request types
- The same granularity of spawn request types (no fastFiller, hubHauler, mineralHarvester, maintainer, etc.)

---

## 4. Layer 3: Room Logistics Requests

### TI's Logistics System

**File**: `src/room/logisticsProcs.ts`

TI creates four types of logistics requests per tick:

| Type       | Meaning                     | Example                           |
| ---------- | --------------------------- | --------------------------------- |
| `transfer` | "Deliver resources to me"   | Controller container needs energy |
| `withdraw` | "Take resources from me"    | Source container full of energy   |
| `pickup`   | "Pick up dropped resources" | Dropped energy on ground          |
| `offer`    | "I can provide if needed"   | Storage offering energy           |

Priority system using `scalePriority(capacity, currentAmount, maxModifier, inverse?)`:

- Lower number = higher priority
- Source containers: priority 20-30 (inverse - fuller = higher priority)
- Fast filler: priority 10-20 (direct - emptier = higher priority)
- Controller: priority 0 when downgrade threatened, else 50+
- Storage/terminal: priority 100 (lowest)

### Our Task System

We have tasks:

- `HarvestTask` - harvesting sources
- `DeliverTask` - delivering to spawns/extensions
- `BuildTask` - building structures
- `UpgradeTask` - upgrading controller

**Gap**: We don't have:

- `pickup` requests for dropped resources
- `offer` requests for providers
- Priority scaling system
- Per-type request pools (transfer, withdraw, offer, pickup)

---

## 5. Role Implementations

### TI's Roles

#### Commune Roles (`src/room/creeps/roleManagers/commune/`)

- `sourceHarvester.ts` - Harvests sources, deposits to containers/links
- `hauler.ts` - Moves energy from source to storage
- `hubHauler.ts` - Hauls between hub locations
- `fastFiller.ts` - Fills spawns/extensions from storage
- `builder.ts` - Builds construction sites
- `maintainer.ts` - Repairs walls/ramparts
- `controllerUpgrader.ts` - Upgrades controller
- `mineralHarvester.ts` - Harvestes minerals from extractor
- `defenders/` - meleeDefender, rangedDefender

#### Remote Roles (`src/room/creeps/roleManagers/remote/`)

- `remoteSourceHarvester.ts` - Harvests in remote rooms
- `remoteReserver.ts` - Reserves controller
- `remoteBuilder.ts` - Builds in remote rooms
- `remoteDismantler.ts` - Dismantles in remote rooms
- `remoteCoreAttacker.ts` - Attacks keeper lairs
- `remoteDefender.ts` - Defends remote rooms

#### International Roles (`src/room/creeps/roleManagers/international/`)

- `scout.ts` - Scouts rooms
- `claimer.ts` - Claims rooms
- `vanguard.ts` - Pioneers new rooms
- `allyVanguard.ts` - Helps allies
- `requestHauler.ts` - Hauls for haul requests

#### Antifa Roles (`src/room/creeps/roleManagers/antifa/`)

- `antifaRangedAttacker.ts`
- `antifaAttacker.ts`
- `antifaHealer.ts`
- `antifaDismantler.ts`

### Our Roles

We have:

- `miner` - Harvests and deposits (similar to sourceHarvester)
- `hauler` - Carries energy
- `worker` - Builds/repairs
- `scout` - Scouts
- `defender` - Combat

**Gap**: Missing many TI roles:

- `hubHauler`, `fastFiller`, `mineralHarvester`, `maintainer` (commune)
- `remoteBuilder`, `remoteDismantler`, `remoteCoreAttacker`, `remoteDefender` (remote)
- `vanguard`, `allyVanguard`, `requestHauler` (international)
- All antifa roles (combat specialized)

---

## 6. Specialized Room Systems

### TI's Commune Features

TI's `src/room/commune/` includes:

| File                 | Purpose                   |
| -------------------- | ------------------------- |
| `factory.ts`         | Factory operation         |
| `labs.ts`            | Laboratory management     |
| `links.ts`           | Link network optimization |
| `nukerProcs.ts`      | Nuker management          |
| `powerSpawnProcs.ts` | Power spawn management    |
| `observerProcs.ts`   | Observer to scry rooms    |
| `communeData.ts`     | Caches commune-level data |

### Our Systems

We have:

- `TowerDefense.ts` - Tower operations
- `LinkPlan.ts` - Link management (basic)

**Gap**: We don't have:

- Factory automation
- Lab/composer management
- Nuker activation
- Power spawn usage
- Observer room scrying

---

## 7. Market & Economy

### TI's Market System

**Files**: `src/international/market/`, `src/international/transactions.ts`

TI has:

- `TransactionsManager` - Processes market transactions
- Formal order management
- Mineral selling with price floors
- Energy balancing via terminals

### Our Market System

We have `TerminalPlan` which:

- Balances energy between rooms
- Sells excess minerals

**Gap**: We don't have:

- Formal transaction tracking
- Order optimization
- Price tracking and analysis
- `TransactionsManager`

---

## 8. Intelligence & Analysis

### TI's Intelligence Systems

- `stats.ts` - Tracks comprehensive statistics
- `mapVisuals.ts` - Visual overlays
- `customPathFinder.ts` - Custom pathfinding
- `players.ts` - Tracks other players
- `flags.ts` - Flag-based commands
- `commands.ts` - Console commands
- `schedule.ts` - Scheduled operations

### Our Intelligence Systems

- `EconomyLogger.ts` - Logs economy status
- `RoomIntel.ts` - Basic room intel

**Gap**: We don't have:

- Comprehensive stats tracking
- Map visuals
- Custom pathfinding beyond Screeps default
- Player tracking
- Flag system
- Console commands
- Operation scheduling

---

## 9. Memory & Initialization

### TI's Memory Management

**Files**: `src/international/segments.ts`, `src/international/init.ts`, `src/international/garbageCollector.ts`

TI has:

- `SegmentsManager` - Raw memory segment I/O
- `InitManager.tryInit()` - First-run initialization
- `GarbageCollector` - Prunes stale memory
- `MigrationManager.tryMigrate()` - Memory schema migrations
- `RespawnManager` - Detects respawn events

### Our Memory Management

We have:

- `runMigrations()` in main.ts
- Basic Memory cleanup

**Gap**: We don't have:

- Memory segments for large data
- Formal garbage collection
- Respawn detection
- Comprehensive migration system

---

## 10. Power Creeps

### TI

TI has `PowerCreepOrganizer.run()` and power creep role implementations.

### Us

We don't have any power creep functionality.

---

## Summary: Priority Gaps to Fill

### High Priority

1. **Formal Spawn Request System** - Refactor SpawnManager into priority-ordered request generation
2. **Missing Commune Roles** - Implement `fastFiller`, `hubHauler`, `mineralHarvester`, `maintainer`
3. **Room Logistics Requests** - Add `offer`, `pickup` request types with priority scaling
4. **HaulRequest System** - Formal inter-room resource transport

### Medium Priority

5. **Missing Remote Roles** - `remoteBuilder`, `remoteDismantler`, `remoteCoreAttacker`
6. **Missing International Roles** - `vanguard`, `allyVanguard`, `requestHauler`
7. **Factory/Labs/Nuker** - Automated factory, lab composition, nuker usage
8. **Observer Scrying** - Use observer to detect room state at distance

### Lower Priority (Nice to Have)

9. **Antifa Roles** - Specialized anti-invader core combat
10. **Map Visuals** - Visual overlays of plans/stats
11. **Stats Tracking** - Comprehensive Grafana-style stats
12. **Power Creeps** - Power creep usage
13. **Memory Segments** - For large data storage
14. **Console Commands** - Manual intervention via flags/console
15. **Custom Pathfinding** - Beyond Screeps default

---

## Appendix: File Comparison

### TI File Count: ~200+ files

### Our File Count: ~50 files

Key TI files we don't have equivalents for:

- `src/international/requests.ts` (formal request system)
- `src/room/logisticsProcs.ts` (logistics request creation)
- `src/room/creeps/creepOps.ts` (logistics request consumption)
- `src/room/commune/spawning/spawnRequests.ts` (spawn request generation)
- `src/room/commune/spawning/spawnRequestConstructors.ts` (body building)
- `src/room/commune/factory.ts`, `labs.ts`, `nukerProcs.ts`
- `src/room/creeps/roleManagers/commune/hubHauler.ts`, `fastFiller.ts`, `mineralHarvester.ts`, `maintainer.ts`
- `src/room/creeps/roleManagers/remote/remoteBuilder.ts`, `remoteDismantler.ts`, `remoteCoreAttacker.ts`
- `src/room/creeps/roleManagers/international/vanguard.ts`, `allyVanguard.ts`, `requestHauler.ts`
- `src/room/creeps/roleManagers/antifa/*` (all antifa roles)
