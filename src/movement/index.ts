/**
 * The single PathFinder call site: requests collected during creep execution,
 * resolved in one pass with heap-cached direction paths, an ops pool, and
 * stuck-repathing around blockers (M2's whole traffic story — shove is M4).
 * See docs/design/movement.md.
 *
 * ## Why movement is centralized
 *
 * Pathfinding is the most expensive thing a Screeps bot does, and the cost is
 * per-call, not per-creep: twenty creeps each calling `moveTo` is twenty searches
 * every tick forever. Collecting requests and resolving them in one place buys
 * three things nothing else can:
 *
 *  1. **A budget.** `opsPoolPerTick` and `maxSearchesPerTick` are hard caps
 *     across the whole bot. When they run out, creeps *stand* — walking late
 *     beats skipping the rest of the tick's intents entirely (primer: exceeding
 *     CPU truncates the tick mid-flight).
 *  2. **Caching that survives.** A path is stored as a list of directions in heap
 *     and replayed one step per tick, so the common case costs a `move()` intent
 *     and nothing else. Paths are in the heap rather than Memory deliberately —
 *     they are cheap to recompute and expensive to serialize every tick.
 *  3. **Traffic resolution.** Because every mover is known before any of them
 *     commits, the shove pass can see that A wants B's tile and B is idle.
 *
 * ## The three throttles, and why each exists
 *
 * They look redundant but guard different failure modes, each one sim-measured:
 *   - `stuckCount` → repath: the creep is being physically blocked and the cached
 *     path is now wrong.
 *   - `searchedAt` cooldown: the path is *right* but the goal is unreachable-ish;
 *     without it a handful of creeps re-searched every tick for 1.7 CPU/tick.
 *   - `blockedUntil`: the search itself threw (a goal off the map). Retrying that
 *     every tick produced an error burst that drowned real telemetry.
 *
 * All three live in module scope, so a global reset simply loses them and the
 * next tick repaths — correct, just briefly more expensive.
 */
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { Pos } from "shared/views";
import { RoomType, roomType } from "intel/index";
import { log } from "telemetry/index";
import { MOVEMENT_CONFIG as CFG } from "movement/config";

interface MoveRequest {
    to: Pos;
    range: number;
}

interface CachedPath {
    to: Pos;
    range: number;
    steps: DirectionConstant[];
    idx: number;
    lastPos: Pos;
    stuckCount: number;
}

const requests = new Map<string, MoveRequest>();
const caches = new Map<string, CachedPath>();
/** Negative cache: a search that THREW (target room off the sim's sparse map
 *  grid, malformed goal) parks the creep instead of re-throwing every tick —
 *  the error burst this prevents was sim-measured at maxSearchesPerTick/window. */
const blockedUntil = new Map<string, number>();
/** Per-creep search cool-off: cached steps are free, but a fresh 600-ops search
 *  per creep per tick is how movement ate 1.7 CPU/tick (sim-measured). */
const searchedAt = new Map<string, { time: number; goal: string }>();
const SEARCH_COOLDOWN = 5;
const goalKey = (req: MoveRequest): string => `${req.to.x},${req.to.y},${req.to.roomName},${req.range}`;
let matrixTick = -1;
const matrices = new Map<string, CostMatrix>();

/**
 * Source-keeper rooms are impassable to pathing.
 *
 * Their guards are permanent, respawning and lethal, and nothing this bot fields
 * survives one. The shortest line from a home to a room two out will sometimes
 * clip an SK room, and the first creep to take that shortcut dies in it. The
 * hazard is *created* by pathing further than next door — at depth 1 it cannot
 * happen (a keeper block needs both coordinates in 4–6) and at depth 2 it can —
 * so it arrives with the same change that widened scouting and remotes.
 *
 * Refusing them per room in the cost callback is the whole mechanism. A **route**
 * ([`Game.map.findRoute`] first, then a tile search confined to the rooms on the
 * way) was implemented and reverted: it is the textbook way to cut ops on long
 * paths, and in this engine it broke cross-room travel outright — the scout in the
 * `remote-mining` gate stopped being able to reach the neighbour it had always
 * reached, oscillating between two rooms instead. Bisected against exactly this
 * code (docs/design/movement.md "Routing"). The ops win is worth revisiting; it is
 * not worth trading working travel for.
 *
 * The creep's OWN room is always passable, so a creep that somehow ends up in a
 * keeper room can still walk out of it.
 */
const impassableRoom = (roomName: string, standingIn: string): boolean =>
    roomName !== standingIn && roomType(roomName) === RoomType.SourceKeeper;

/**
 * Ask for a step toward `to`, stopping within `range` tiles (chebyshev). Called
 * during creep execution; nothing moves until `resolveMoves` runs. One request
 * per creep per tick — a later call replaces an earlier one, which is what makes
 * "last decision wins" the rule rather than an accident of ordering.
 */
export function requestMove(creepName: string, to: Pos, range: number): void {
    requests.set(creepName, { to, range });
}

function samePos(a: Pos, b: { x: number; y: number; roomName: string }): boolean {
    return a.x === b.x && a.y === b.y && a.roomName === b.roomName;
}

function sameTarget(a: CachedPath, req: MoveRequest): boolean {
    return a.range === req.range && samePos(a.to, req.to);
}

const DELTA_TO_DIR: Record<string, DirectionConstant> = {
    "0,-1": TOP,
    "1,-1": TOP_RIGHT,
    "1,0": RIGHT,
    "1,1": BOTTOM_RIGHT,
    "0,1": BOTTOM,
    "-1,1": BOTTOM_LEFT,
    "-1,0": LEFT,
    "-1,-1": TOP_LEFT
};

const DIR_TO_DELTA: Partial<Record<DirectionConstant, [number, number]>> = {
    [TOP]: [0, -1],
    [TOP_RIGHT]: [1, -1],
    [RIGHT]: [1, 0],
    [BOTTOM_RIGHT]: [1, 1],
    [BOTTOM]: [0, 1],
    [BOTTOM_LEFT]: [-1, 1],
    [LEFT]: [-1, 0],
    [TOP_LEFT]: [-1, -1]
};

/** Moves issued this tick, for the shove pass. */
const issued = new Map<string, DirectionConstant>();

/**
 * Compress a PathFinder path into replayable directions. Room transitions are
 * skipped rather than encoded: stepping onto an edge tile teleports the creep to
 * the neighbor room, so the border crossing has no direction of its own and
 * emitting one would desynchronize every step after it.
 */
function toDirections(start: RoomPosition, path: RoomPosition[]): DirectionConstant[] {
    const steps: DirectionConstant[] = [];
    let prev = start;
    for (const pos of path) {
        if (pos.roomName !== prev.roomName) {
            prev = pos; // room transition: the border step is implicit
            continue;
        }
        const dir = DELTA_TO_DIR[`${pos.x - prev.x},${pos.y - prev.y}`];
        if (dir !== undefined) {
            steps.push(dir);
        }
        prev = pos;
    }
    return steps;
}

/** Per-room-per-tick matrix: blocking structures from the snapshot view. */
function roomMatrix(ctx: TickContext, roomName: string): CostMatrix | undefined {
    if (matrixTick !== ctx.snapshot.time) {
        matrices.clear();
        matrixTick = ctx.snapshot.time;
    }
    const cached = matrices.get(roomName);
    if (cached) {
        return cached;
    }
    const view = ctx.snapshot.room(roomName);
    if (!view) {
        return undefined;
    }
    const matrix = new PathFinder.CostMatrix();
    for (const [type, structures] of Object.entries(view.structures)) {
        if (type === STRUCTURE_ROAD || type === STRUCTURE_CONTAINER || type === STRUCTURE_RAMPART) {
            continue; // hostile ramparts blocking is an explicit M4 dependency
        }
        for (const s of structures) {
            matrix.set(s.pos.x, s.pos.y, 255);
        }
    }
    matrices.set(roomName, matrix);
    return matrix;
}

/** Clone + stamp current creep positions — never mutate the shared per-tick matrix. */
function stuckMatrix(ctx: TickContext, roomName: string, selfName: string): CostMatrix {
    const base = roomMatrix(ctx, roomName);
    const matrix = base ? base.clone() : new PathFinder.CostMatrix();
    for (const other of Object.values(Game.creeps)) {
        if (other.name !== selfName && other.pos.roomName === roomName) {
            matrix.set(other.pos.x, other.pos.y, 255);
        }
    }
    return matrix;
}

/**
 * The class-A entry, after creep execution in the normative order.
 *
 * Per creep, in order: drop the request if it's gone or already in range; skip if
 * fatigued (a fatigued creep cannot move, so counting it as "stuck" would repath
 * a perfectly good path); replay the cached step if the last one landed; re-issue
 * without advancing if it didn't; repath once genuinely stuck. Only after all of
 * that does anyone spend from the ops pool.
 */
export function resolveMoves(ctx: TickContext): void {
    let opsPool = CFG.opsPoolPerTick;
    let searches = 0;
    let deferred = 0;

    for (const [name, req] of requests) {
        const creep = Game.creeps[name];
        if (!creep) {
            caches.delete(name);
            continue;
        }
        const pos = creep.pos;
        if (
            pos.roomName === req.to.roomName &&
            Math.max(Math.abs(pos.x - req.to.x), Math.abs(pos.y - req.to.y)) <= req.range
        ) {
            caches.delete(name);
            continue;
        }
        if (creep.fatigue > 0) {
            continue; // no step, no idx advance, no stuck counting
        }

        // `stamped` = "this is a stuck-repath", which both exempts the creep from
        // the search cooldown and swaps in a matrix with other creeps marked
        // impassable, so the new path actually routes around whatever blocked it.
        const cached = caches.get(name);
        let stamped = false;
        if (cached && sameTarget(cached, req) && cached.idx < cached.steps.length) {
            if (!samePos(cached.lastPos, pos)) {
                // Last step happened: advance normally.
                creep.move(cached.steps[cached.idx]);
                issued.set(name, cached.steps[cached.idx]);
                cached.idx++;
                cached.lastPos = { x: pos.x, y: pos.y, roomName: pos.roomName };
                cached.stuckCount = 0;
                continue;
            }
            if (cached.stuckCount + 1 < CFG.stuckTicks) {
                // Blocked: re-issue the same step without advancing.
                cached.stuckCount++;
                creep.move(cached.steps[cached.idx]);
                issued.set(name, cached.steps[cached.idx]);
                continue;
            }
            // Stuck: repath around blockers.
            caches.delete(name);
            stamped = true;
        }

        if ((blockedUntil.get(name) ?? 0) > ctx.snapshot.time) {
            continue; // known-unreachable goal; re-try after the cool-off
        }
        const lastSearch = searchedAt.get(name);
        if (
            !stamped &&
            lastSearch !== undefined &&
            lastSearch.goal === goalKey(req) &&
            ctx.snapshot.time - lastSearch.time < SEARCH_COOLDOWN
        ) {
            continue; // same goal, just searched: stand rather than churn the ops
            // pool (stuck-repaths and changed goals are exempt — the first is
            // already rate-limited, the second is genuinely new work)
        }
        if (searches >= CFG.maxSearchesPerTick || opsPool <= 0) {
            deferred++;
            continue; // stands this tick; walking late beats blowing the budget
        }
        // Same-room goals are pinned to maxRooms:1 — without it PathFinder will
        // happily route out through a neighbor and back, which is both slower to
        // search and slower to walk. Cross-room goals get the full 16 and the same
        // ops cap (a bigger one starves the shared pool — see movement/config.ts).
        const sameRoom = pos.roomName === req.to.roomName;
        const maxOps = Math.min(CFG.maxOpsPerSearch, opsPool);
        let result: PathFinderPath;
        try {
            const goal = { pos: new RoomPosition(req.to.x, req.to.y, req.to.roomName), range: req.range };
            result = PathFinder.search(pos, goal, {
                maxOps,
                plainCost: CFG.plainCost,
                swampCost: CFG.swampCost,
                maxRooms: sameRoom ? 1 : 16,
                roomCallback: roomName => {
                    if (impassableRoom(roomName, pos.roomName)) {
                        return false; // lethal permanent guards; never route through
                    }
                    return stamped && roomName === pos.roomName
                        ? stuckMatrix(ctx, roomName, name)
                        : roomMatrix(ctx, roomName) ?? new PathFinder.CostMatrix();
                }
            });
        } catch (err) {
            blockedUntil.set(name, ctx.snapshot.time + 100);
            log.debug(SubsystemId.Movement, () => `${name} search threw for ${req.to.roomName}: ${String(err)}`);
            continue;
        }
        opsPool -= result.ops;
        searches++;
        searchedAt.set(name, { time: ctx.snapshot.time, goal: goalKey(req) });
        if (result.incomplete) {
            log.debug(SubsystemId.Movement, () => `${name} incomplete path (${result.ops} ops)`);
        }
        const steps = toDirections(pos, result.path);
        if (steps.length === 0) {
            continue;
        }
        creep.move(steps[0]);
        issued.set(name, steps[0]);
        caches.set(name, {
            to: req.to,
            range: req.range,
            steps,
            idx: 1,
            lastPos: { x: pos.x, y: pos.y, roomName: pos.roomName },
            stuckCount: 0
        });
    }
    if (deferred > 0) {
        log.debug(SubsystemId.Movement, () => `${deferred} moves deferred (budget)`);
    }
    shovePass(ctx);
    requests.clear();
    issued.clear();
}

/** The M4 shove pass (movement.md): an idle blocker on a mover's next tile gets a
 *  swap step toward the mover's tile — both moves resolve simultaneously and the
 *  engine allows exchanges. Never shoves a creep on a container tile (miner seat). */
function shovePass(ctx: TickContext): void {
    if (issued.size === 0) {
        return;
    }
    const byTile = new Map<string, Creep>();
    for (const other of Object.values(Game.creeps)) {
        byTile.set(`${other.pos.x},${other.pos.y},${other.pos.roomName}`, other);
    }
    const shoved = new Set<string>();
    for (const [name, dir] of issued) {
        const mover = Game.creeps[name];
        const delta = DIR_TO_DELTA[dir];
        if (!mover || !delta) {
            continue;
        }
        const tx = mover.pos.x + delta[0];
        const ty = mover.pos.y + delta[1];
        const blocker = byTile.get(`${tx},${ty},${mover.pos.roomName}`);
        if (!blocker || blocker.name === name || !blocker.my) {
            continue;
        }
        if (requests.has(blocker.name) || issued.has(blocker.name) || shoved.has(blocker.name)) {
            continue; // it has plans of its own this tick
        }
        if (blocker.fatigue > 0) {
            continue;
        }
        const view = ctx.snapshot.room(blocker.pos.roomName);
        const onContainer = (view?.structures[STRUCTURE_CONTAINER] ?? []).some(
            c => c.pos.x === blocker.pos.x && c.pos.y === blocker.pos.y
        );
        if (onContainer) {
            continue; // a miner's seat; the mover's stuck-repath walks around instead
        }
        const back = DELTA_TO_DIR[`${mover.pos.x - tx},${mover.pos.y - ty}`];
        if (back !== undefined) {
            blocker.move(back);
            shoved.add(blocker.name);
        }
    }
}

/** Wipes all module-scope state. Tests only — production relies on a global
 *  reset doing exactly this for free. */
export function _clearForTest(): void {
    requests.clear();
    caches.clear();
    matrices.clear();
    matrixTick = -1;
    issued.clear();
    blockedUntil.clear();
    searchedAt.clear();
}
