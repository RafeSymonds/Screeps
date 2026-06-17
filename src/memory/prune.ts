/**
 * Memory hygiene seam. Screeps Memory is capped at 2 MB, so orphaned keys from
 * retired features must be pruned. Currently a no-op; subsystems that retire a
 * Memory key should add a cleanup pass here (see docs/qa/MEMORY_MIGRATIONS.md).
 */
export function pruneMemory(): void {
    // Intentionally empty for now. Reserved seam for orphan-key cleanup.
}
