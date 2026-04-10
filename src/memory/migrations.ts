const CURRENT_VERSION = 1;

export function runMigrations(): void {
    const memory = Memory as { version?: number };
    const version = memory.version ?? 0;

    if (version < CURRENT_VERSION) {
        if (version < 1) {
            migrateToV1();
        }
        memory.version = CURRENT_VERSION;
    }
}

function migrateToV1(): void {
    // Phase 2 baseline: all existing memory schemas are forward-compatible.
    // This migration handles any legacy keys that need cleanup.

    for (const roomName in Memory.rooms) {
        const room = Memory.rooms[roomName] as unknown as Record<string, unknown>;

        // Clean up any orphaned keys from retired features
        delete room.scoutInfo;
        delete room.lastScout;
    }
}
