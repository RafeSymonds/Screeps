/**
 * Build priority — the one ordered list of what matters most, shared between the
 * construction sequencer (site placement order) and the Build executor (focus-site
 * ranking) so they can never disagree. See docs/design/construction.md.
 */
export const BUILD_PRIORITY: BuildableStructureConstant[] = [
    STRUCTURE_SPAWN,
    STRUCTURE_EXTENSION,
    STRUCTURE_CONTAINER,
    STRUCTURE_TOWER,
    STRUCTURE_STORAGE,
    STRUCTURE_LINK,
    STRUCTURE_TERMINAL,
    STRUCTURE_LAB,
    STRUCTURE_FACTORY,
    STRUCTURE_OBSERVER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_NUKER,
    STRUCTURE_EXTRACTOR,
    STRUCTURE_ROAD,
    STRUCTURE_RAMPART,
    STRUCTURE_WALL
];

/** Rank of a type in BUILD_PRIORITY; unknown types sort last. */
export function buildPriorityIndex(type: StructureConstant): number {
    const i = BUILD_PRIORITY.indexOf(type as BuildableStructureConstant);
    return i === -1 ? BUILD_PRIORITY.length : i;
}

/** Maintenance types recur for the life of the room (roads and ramparts decay
 *  forever), so their sites must never trigger the investment regime — economy.md
 *  rule 3 (sim-caught: road sites pinned upgraders at the floor permanently). */
export const MAINTENANCE_TYPES = new Set<StructureConstant>([STRUCTURE_ROAD, STRUCTURE_RAMPART, STRUCTURE_WALL]);

export function isInvestmentSite(type: StructureConstant): boolean {
    return !MAINTENANCE_TYPES.has(type);
}
