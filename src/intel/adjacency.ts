/**
 * Room-graph helpers. `Game.map` works without vision (terrain + exits are always
 * known), so neighbor enumeration and linear distance need no scouting — they are
 * the entry point the empire layer uses to find remote candidates.
 */

/** Room names directly adjacent to `roomName` (its 4 cardinal exits). */
export function describeExits(roomName: string): string[] {
    const exits = Game.map.describeExits(roomName) ?? {};
    return Object.values(exits).filter((name): name is string => name !== undefined);
}

/** Map-grid (room-count) distance between two rooms. 1 = directly adjacent. */
export function roomLinearDistance(a: string, b: string): number {
    return Game.map.getRoomLinearDistance(a, b);
}
