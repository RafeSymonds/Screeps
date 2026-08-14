/**
 * Reach: how far away a room is, in room transitions, over the exit graph.
 * See docs/design/intel.md "Reach".
 *
 * ## Why not linear distance
 *
 * `Game.map.getRoomLinearDistance` is chebyshev over the map grid, so a diagonal
 * neighbour reports distance 1 — but creeps cannot move diagonally between rooms.
 * Getting there means crossing two borders, so the real cost is 2. Every consumer
 * that turns distance into travel time (remotes' hauler math, most of all) was
 * therefore understating the cost of half its candidates by a factor of two.
 *
 * Depth over the exit graph is the honest number: it counts the borders a creep
 * actually crosses.
 *
 * ## Why a BFS and not just describeExits
 *
 * `describeExits` answers "what is next door". Scouting and remote adoption both
 * want "everything within N rooms", which is a search, and both want it filtered
 * the same way — never route through a source-keeper room, whose permanent armed
 * guards kill anything that wanders in. Doing that once here means a scout, a
 * hauler and an expansion candidate all agree on what is reachable.
 *
 * ## `describeExits` is not a membership test — sim-caught, Aug 2026
 *
 * A named neighbour is admitted to the graph on the strength of the name alone. It
 * is tempting to verify it first by asking whether IT answers `describeExits`,
 * since on a sparse world (every sim scenario) a room may be named without
 * existing. That check is wrong, and it silently deleted the only route to the
 * room the `remote-far` scenario exists to mine.
 *
 * The engine builds its map grid **once per isolate**, from whatever room terrain
 * has been shipped to the runtime so far (`driver/lib/runtime/runtime.js`:
 * `if(!mapGrid) mapGrid = new WorldMapGrid(accessibleRooms, staticTerrainData)`).
 * Terrain arrives lazily, for rooms we have touched. So `describeExits(X)` returns
 * null for plenty of real, walkable, adjacent rooms — every room we have not been
 * to yet, which is precisely the set scouting exists to visit. Using it as an
 * existence test makes the bot blind to exactly the rooms it wants to discover,
 * and the blindness is self-sustaining: never admitted, never scouted, never
 * touched, never in the grid.
 *
 * Unreadable exits therefore mean only "cannot expand THROUGH this room" — it
 * becomes a leaf. "Can we actually get there?" is answered where it can be
 * answered honestly, by sending a scout and noticing it never arrives (intel's
 * scout patience), which also covers rooms that are real but walled off.
 */

/** roomName → room transitions from the origin. Origin included at depth 0. */
export type ReachMap = Map<string, number>;

export interface ReachInput {
    origin: string;
    maxDepth: number;
    /** A room's exits, or `undefined` if the room is not on the map at all. */
    exitsOf: (roomName: string) => string[] | undefined;
    /** Rooms that may be neither entered nor returned (source-keeper rooms). */
    blocked?: (roomName: string) => boolean;
}

export interface ReachResult {
    rooms: ReachMap;
    /** False if a room we tried to EXPAND had unreadable exits — the graph may be
     *  missing everything behind it, so the caller must not cache it as final. */
    complete: boolean;
}

/**
 * Breadth-first search over the exit graph, out to `maxDepth` transitions.
 *
 * Breadth-first rather than any weighted search because every edge is one border
 * crossing: the first time we reach a room is by definition its cheapest route,
 * so there is nothing to relax and no priority queue to pay for.
 */
export function reach(input: ReachInput): ReachResult {
    const { origin, maxDepth, exitsOf, blocked } = input;
    const rooms: ReachMap = new Map([[origin, 0]]);
    let complete = true;
    let frontier = [origin];
    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
        const next: string[] = [];
        for (const room of frontier) {
            const exits = exitsOf(room);
            if (exits === undefined) {
                // A leaf, not a deletion: everything BEHIND this room is missing
                // from the graph, so the result must not be cached as final (the
                // grid fills in as terrain is shipped — see the header).
                complete = false;
                continue;
            }
            for (const neighbor of exits) {
                if (rooms.has(neighbor) || blocked?.(neighbor) === true) {
                    continue;
                }
                rooms.set(neighbor, depth);
                next.push(neighbor);
            }
        }
        frontier = next;
    }
    return { rooms, complete };
}
