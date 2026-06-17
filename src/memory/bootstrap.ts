import { MEMORY_VERSION } from "config/constants";

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
