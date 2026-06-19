import { MEMORY_VERSION } from "config/constants";
import { SpawnRole } from "spawn/types";

/**
 * Owns top-level Memory initialization and version-gated migrations.
 * Runs first thing every tick so every other subsystem can assume its
 * Memory slice exists.
 */
export function bootstrapMemory(): void {
    if (Memory.version === undefined) {
        Memory.version = 0;
    }
    if (!Memory.jobs) {
        Memory.jobs = {};
    }
    if (!Memory.planRuns) {
        Memory.planRuns = {};
    }
    if (!Memory.creeps) {
        Memory.creeps = {};
    }
    if (!Memory.rooms) {
        Memory.rooms = {};
    }
    runMigrations();
}

/**
 * Version-gated migration block (see docs/qa/MEMORY_MIGRATIONS.md strategy C).
 * Add a `if (Memory.version < N) { ...; Memory.version = N; }` block per change.
 */
function runMigrations(): void {
    // No historical schemas to migrate yet — this is a fresh restart.
    if (Memory.version < MEMORY_VERSION) {
        Memory.version = MEMORY_VERSION;
    }
}

/**
 * Delete Memory for creeps that no longer exist. Job assignment cleanup is
 * handled separately by JobBoard.reconcile(), keeping the two concerns decoupled.
 */
export function cleanDeadCreeps(): void {
    for (const name in Memory.creeps) {
        if (!(name in Game.creeps)) {
            delete Memory.creeps[name];
        }
    }
}

/**
 * Backfill required CreepMemory for any live creep missing it. The bot must not
 * assume every creep was born through SpawnManager with a full memory object —
 * creeps can appear with empty/undefined memory (engine-injected, claimed, or
 * surviving a memory-schema change). Such creeps are invisible to the economy
 * model (`home`/`spawnRole` drive population + labor accounting) and, with no
 * memory entry, `JobBoard.assign` silently fails to record their `jobId`, leaving
 * them idle with no log. Accessing `creep.memory` auto-creates the entry; we then
 * fill sane defaults (generalist at its current room) so matching and accounting
 * always have something real to read.
 */
export function ensureCreepMemory(): void {
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        const mem = creep.memory;
        if (mem.home === undefined) {
            mem.home = creep.room.name;
        }
        if (mem.spawnRole === undefined) {
            mem.spawnRole = SpawnRole.Generalist;
        }
        if (mem.working === undefined) {
            mem.working = false;
        }
    }
}
