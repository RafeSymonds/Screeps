/**
 * Miner seat assignment — each miner of a source gets its OWN exact tile.
 * Pure. See docs/design/creeps.md.
 *
 * ## The bug this exists to kill
 *
 * A range-based goal does not identify a tile. Telling two miners "get within
 * range 1 of the source" lets PathFinder pick for each of them, and PathFinder is
 * deterministic — so it picks the *same* tile for both. They then shove each
 * other over it forever, mining nothing, and the room starves downstream.
 *
 * The earlier fix picked one "seat owner" entitled to the container tile and sent
 * everyone else to `range 1`. That was not enough, in two distinct ways:
 *
 *  1. The non-owners still shared one range-1 goal, so they still collided — and
 *     PathFinder could route them straight onto the container tile the owner
 *     wanted, since containers are walkable and nothing excluded that tile.
 *  2. With **no container at all** — early RCL, and every remote before its
 *     container is built — there was no owner, so *every* miner fell to the same
 *     range-1 goal. The differentiation only existed in the case that already
 *     mostly worked.
 *
 * The fix is to stop expressing seats as ranges. Every miner is given a distinct
 * `{x, y}` and moves to it with `range: 0`. Two creeps can then never be issued
 * the same destination, so there is nothing to contend over.
 */
import { Pos } from "shared/views";
import { TerrainGrid } from "snapshot/terrain";

export interface SeatInput {
    source: Pos;
    terrain: TerrainGrid;
    /** Tiles a creep cannot stand on — blocking structures, packed y*50+x. */
    blocked: ReadonlySet<number>;
    /** The source's container tile, if one exists. Always the best seat: mining
     *  from it drops straight into the container (engine `_create-energy`), which
     *  is also the hauler pickup point, so nothing decays on the ground. */
    container?: Pos;
}

const NEIGHBORS: readonly [number, number][] = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1]
];

/**
 * Every tile a miner could legally work this source from, best first.
 *
 * Room-edge tiles (0 and 49) are excluded: the engine teleports any creep
 * standing on one into the neighbouring room every tick, so a miner seated there
 * would ping-pong across the border instead of mining.
 */
export function seatTiles(input: SeatInput): Pos[] {
    const { source, terrain, blocked, container } = input;
    const seats: Pos[] = [];
    for (const [dx, dy] of NEIGHBORS) {
        const x = source.x + dx;
        const y = source.y + dy;
        if (x < 1 || x > 48 || y < 1 || y > 48) continue;
        if (terrain.isWall(x, y)) continue;
        if (blocked.has(y * 50 + x)) continue;
        seats.push({ x, y, roomName: source.roomName });
    }
    // Container first, then ascending (y, x) so the order is a total function of
    // the room — two miners computing this independently must agree exactly.
    seats.sort((a, b) => {
        const aC = container && a.x === container.x && a.y === container.y ? 0 : 1;
        const bC = container && b.x === container.x && b.y === container.y ? 0 : 1;
        return aC - bC || a.y - b.y || a.x - b.x;
    });
    return seats;
}

/**
 * Hand out seats: name → the exact tile that miner owns.
 *
 * Sticky first — a miner already standing on a seat keeps it — so a newly spawned
 * miner never evicts a working one and the whole room does not reshuffle every
 * time the roster changes. Everyone else takes the best free seat in name order,
 * which is arbitrary but *stable*, and stability is the entire point: an unstable
 * rule just relocates the shoving.
 *
 * Miners beyond the seat count get nothing (`undefined`). That is correct rather
 * than a gap — the economy planner already caps miners per source at the walkable
 * seat count, so it means the room is over-staffed and the extra creep should not
 * be fighting for a tile it cannot have.
 */
export function assignSeats(seats: Pos[], miners: readonly { name: string; pos: Pos }[]): Map<string, Pos> {
    const out = new Map<string, Pos>();
    const taken = new Set<number>();
    const ordered = [...miners].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const miner of ordered) {
        const i = seats.findIndex(s => s.x === miner.pos.x && s.y === miner.pos.y && s.roomName === miner.pos.roomName);
        if (i >= 0 && !taken.has(i)) {
            out.set(miner.name, seats[i]);
            taken.add(i);
        }
    }
    let next = 0;
    for (const miner of ordered) {
        if (out.has(miner.name)) continue;
        while (next < seats.length && taken.has(next)) next++;
        if (next >= seats.length) break;
        out.set(miner.name, seats[next]);
        taken.add(next);
        next++;
    }
    return out;
}
