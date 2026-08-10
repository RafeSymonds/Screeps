/**
 * The single PathFinder call site: requests collected during creep execution,
 * resolved in one pass with heap-cached direction paths, an ops pool, and
 * stuck-repathing around blockers (M2's whole traffic story — shove is M4).
 * See docs/design/movement.md.
 */
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { Pos } from "shared/views";
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
let matrixTick = -1;
const matrices = new Map<string, CostMatrix>();

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

/** The class-A entry, after creep execution in the normative order. */
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

        if (searches >= CFG.maxSearchesPerTick || opsPool <= 0) {
            deferred++;
            continue; // stands this tick; walking late beats blowing the budget
        }
        const sameRoom = pos.roomName === req.to.roomName;
        const maxOps = Math.min(CFG.maxOpsPerSearch, opsPool);
        const goal = { pos: new RoomPosition(req.to.x, req.to.y, req.to.roomName), range: req.range };
        const result = PathFinder.search(pos, goal, {
            maxOps,
            plainCost: CFG.plainCost,
            swampCost: CFG.swampCost,
            maxRooms: sameRoom ? 1 : 16,
            roomCallback: roomName =>
                stamped && roomName === pos.roomName
                    ? stuckMatrix(ctx, roomName, name)
                    : roomMatrix(ctx, roomName) ?? new PathFinder.CostMatrix()
        });
        opsPool -= result.ops;
        searches++;
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

export function _clearForTest(): void {
    requests.clear();
    caches.clear();
    matrices.clear();
    matrixTick = -1;
    issued.clear();
}
