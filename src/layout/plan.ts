/**
 * The pure base planner: terrain + POIs + existing structures → BasePlan through
 * RCL8. Every search is 8-way (chebyshev, matching creep movement); every tie
 * breaks by ascending (y, x) so the plan is a total function of its input.
 * See docs/design/layout.md for every rule and offset here.
 */
import { Pos } from "shared/views";
import { TerrainGrid } from "snapshot/terrain";

export interface LayoutInput {
    roomName: string;
    terrain: TerrainGrid;
    controller: Pos;
    sources: Pos[];
    mineral?: Pos;
    structures: { type: StructureConstant; pos: Pos }[];
}

export interface BasePlan {
    anchor: Pos;
    /** Explicit — not derivable from places order (walled-in case would alias). */
    controllerContainer?: Pos;
    places: Partial<Record<BuildableStructureConstant, Pos[]>>;
}

/** Bump when the algorithm changes shape; forces a recompute (layout.md). */
export const LAYOUT_PLAN_VERSION = 1;

/** Packing matches snapshot/terrain's grid index convention. */
export const pack = (x: number, y: number): number => y * 50 + x;
export const unpack = (p: number, roomName: string): Pos => ({ x: p % 50, y: Math.floor(p / 50), roomName });

/** RCL8 structure counts the plan fills exactly (containers/roads/ramparts are need-based). */
const RCL8_LIMITS: Partial<Record<BuildableStructureConstant, number>> = {
    [STRUCTURE_SPAWN]: 3,
    [STRUCTURE_EXTENSION]: 60,
    [STRUCTURE_TOWER]: 6,
    [STRUCTURE_STORAGE]: 1,
    [STRUCTURE_TERMINAL]: 1,
    [STRUCTURE_FACTORY]: 1,
    [STRUCTURE_OBSERVER]: 1,
    [STRUCTURE_POWER_SPAWN]: 1,
    [STRUCTURE_NUKER]: 1,
    [STRUCTURE_LAB]: 10,
    [STRUCTURE_LINK]: 6,
    [STRUCTURE_EXTRACTOR]: 1,
    [STRUCTURE_CONTAINER]: 5,
    [STRUCTURE_ROAD]: 2500,
    [STRUCTURE_RAMPART]: 2500,
    [STRUCTURE_WALL]: 2500
};

/** Structures creeps cannot walk through — the cost-grid and tile-claim distinction. */
const OBSTACLE_TYPES = new Set<StructureConstant>([
    STRUCTURE_SPAWN,
    STRUCTURE_EXTENSION,
    STRUCTURE_TOWER,
    STRUCTURE_STORAGE,
    STRUCTURE_TERMINAL,
    STRUCTURE_FACTORY,
    STRUCTURE_OBSERVER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_NUKER,
    STRUCTURE_LAB,
    STRUCTURE_LINK,
    STRUCTURE_EXTRACTOR,
    STRUCTURE_WALL
]);

/** Core stamp: anchor-relative offsets, all on the anchor's checkerboard parity. */
const CORE_STAMP: { type: BuildableStructureConstant; dx: number; dy: number }[] = [
    { type: STRUCTURE_STORAGE, dx: 0, dy: 2 },
    { type: STRUCTURE_TERMINAL, dx: -2, dy: 0 },
    { type: STRUCTURE_SPAWN, dx: 2, dy: 0 },
    { type: STRUCTURE_FACTORY, dx: 0, dy: -2 },
    { type: STRUCTURE_SPAWN, dx: -2, dy: -2 },
    { type: STRUCTURE_NUKER, dx: 2, dy: 2 },
    { type: STRUCTURE_OBSERVER, dx: -2, dy: 2 },
    { type: STRUCTURE_POWER_SPAWN, dx: 2, dy: -2 },
    { type: STRUCTURE_TOWER, dx: -1, dy: 1 },
    { type: STRUCTURE_TOWER, dx: 1, dy: -1 },
    { type: STRUCTURE_TOWER, dx: -1, dy: -1 },
    { type: STRUCTURE_TOWER, dx: 1, dy: 1 },
    { type: STRUCTURE_TOWER, dx: 3, dy: 1 },
    { type: STRUCTURE_TOWER, dx: -3, dy: -1 }
];

/** Neighbor offsets in ascending (dy, dx) — BFS determinism depends on this order. */
const NEIGHBORS: [number, number][] = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1]
];

const inRoom = (x: number, y: number): boolean => x >= 0 && x <= 49 && y >= 0 && y <= 49;
const cheb = (ax: number, ay: number, b: Pos): number => Math.max(Math.abs(ax - b.x), Math.abs(ay - b.y));
const byYX = (a: Pos, b: Pos): number => a.y - b.y || a.x - b.x;

/** 8-way BFS distance from `from` over non-wall tiles. Infinity = unreachable. */
function bfsDistances(terrain: TerrainGrid, from: Pos): Int32Array {
    const dist = new Int32Array(2500).fill(-1);
    const queue: number[] = [pack(from.x, from.y)];
    dist[queue[0]] = 0;
    for (let head = 0; head < queue.length; head++) {
        const p = queue[head];
        const x = p % 50;
        const y = Math.floor(p / 50);
        for (const [dx, dy] of NEIGHBORS) {
            const nx = x + dx;
            const ny = y + dy;
            if (!inRoom(nx, ny) || terrain.isWall(nx, ny)) continue;
            const np = pack(nx, ny);
            if (dist[np] === -1) {
                dist[np] = dist[p] + 1;
                queue.push(np);
            }
        }
    }
    return dist;
}

interface Ctx {
    input: LayoutInput;
    anchorDist: Int32Array;
    /** Tiles holding a planned or existing structure of any type. */
    claimed: Set<number>;
    /** Subset of claimed that creeps cannot walk through. */
    blocked: Set<number>;
    places: Partial<Record<BuildableStructureConstant, Pos[]>>;
}

function claim(ctx: Ctx, type: BuildableStructureConstant, pos: Pos): void {
    (ctx.places[type] ??= []).push(pos);
    const p = pack(pos.x, pos.y);
    ctx.claimed.add(p);
    if (OBSTACLE_TYPES.has(type)) {
        ctx.blocked.add(p);
    }
}

/** Generic building-tile predicate (layout.md "Valid"): stamp, extensions, labs. */
function validGeneric(ctx: Ctx, x: number, y: number): boolean {
    const { terrain, controller, sources, mineral } = ctx.input;
    if (x < 2 || x > 47 || y < 2 || y > 47 || terrain.isWall(x, y)) return false;
    if (cheb(x, y, controller) <= 3) return false;
    for (const s of sources) if (cheb(x, y, s) <= 1) return false;
    if (mineral && cheb(x, y, mineral) <= 1) return false;
    return !ctx.claimed.has(pack(x, y));
}

/** BFS over all tiles from a start point, visiting in (distance, insertion) order. */
function* bfsOrder(terrain: TerrainGrid, from: Pos): Generator<{ x: number; y: number }> {
    const seen = new Uint8Array(2500);
    const queue: number[] = [pack(from.x, from.y)];
    seen[queue[0]] = 1;
    for (let head = 0; head < queue.length; head++) {
        const p = queue[head];
        const x = p % 50;
        const y = Math.floor(p / 50);
        yield { x, y };
        for (const [dx, dy] of NEIGHBORS) {
            const nx = x + dx;
            const ny = y + dy;
            if (!inRoom(nx, ny) || terrain.isWall(nx, ny)) continue;
            const np = pack(nx, ny);
            if (!seen[np]) {
                seen[np] = 1;
                queue.push(np);
            }
        }
    }
}

/** Step 1 (generic types only): existing structures head their arrays, tiles claimed. */
function incorporate(ctx: Ctx): void {
    const generic = new Set<BuildableStructureConstant>([
        STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_STORAGE,
        STRUCTURE_TERMINAL, STRUCTURE_FACTORY, STRUCTURE_OBSERVER, STRUCTURE_POWER_SPAWN,
        STRUCTURE_NUKER, STRUCTURE_LAB, STRUCTURE_LINK, STRUCTURE_EXTRACTOR, STRUCTURE_WALL
    ]);
    for (const type of generic) {
        const existing = ctx.input.structures
            .filter(s => s.type === type)
            .map(s => s.pos)
            .sort(byYX)
            .slice(0, RCL8_LIMITS[type] ?? 0);
        for (const pos of existing) {
            if (!ctx.claimed.has(pack(pos.x, pos.y))) {
                claim(ctx, type, pos);
            }
        }
    }
    // Non-generic existing structures still block/occupy their tiles.
    for (const s of ctx.input.structures) {
        const p = pack(s.pos.x, s.pos.y);
        ctx.claimed.add(p);
        if (OBSTACLE_TYPES.has(s.type)) {
            ctx.blocked.add(p);
        }
    }
}

/** Step 2: first existing spawn by (y,x), else clearance-maximal valid tile. */
export function chooseAnchor(input: LayoutInput): Pos | undefined {
    const spawns = input.structures
        .filter(s => s.type === STRUCTURE_SPAWN)
        .map(s => s.pos)
        .sort(byYX);
    if (spawns.length > 0) {
        return spawns[0];
    }
    // Chebyshev distance transform to nearest wall or room edge (edges count as walls).
    const clearance = new Int32Array(2500);
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            clearance[pack(x, y)] = input.terrain.isWall(x, y) ? 0 : 2500;
        }
    }
    const at = (x: number, y: number): number => (inRoom(x, y) ? clearance[pack(x, y)] : 0);
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            const p = pack(x, y);
            if (clearance[p] === 0) continue;
            clearance[p] = Math.min(clearance[p], 1 + Math.min(at(x - 1, y), at(x, y - 1), at(x - 1, y - 1), at(x + 1, y - 1)));
        }
    }
    for (let y = 49; y >= 0; y--) {
        for (let x = 49; x >= 0; x--) {
            const p = pack(x, y);
            if (clearance[p] === 0) continue;
            clearance[p] = Math.min(clearance[p], 1 + Math.min(at(x + 1, y), at(x, y + 1), at(x + 1, y + 1), at(x - 1, y + 1)));
        }
    }
    const pois = [input.controller, ...input.sources];
    const cx = pois.reduce((s, p) => s + p.x, 0) / pois.length;
    const cy = pois.reduce((s, p) => s + p.y, 0) / pois.length;
    let best: { x: number; y: number; clear: number; cent: number } | undefined;
    for (let y = 2; y <= 47; y++) {
        for (let x = 2; x <= 47; x++) {
            if (input.terrain.isWall(x, y)) continue;
            if (cheb(x, y, input.controller) <= 3) continue;
            if (input.sources.some(s => cheb(x, y, s) <= 1)) continue;
            if (input.mineral && cheb(x, y, input.mineral) <= 1) continue;
            const clear = clearance[pack(x, y)];
            const cent = Math.max(Math.abs(x - cx), Math.abs(y - cy));
            if (!best || clear > best.clear || (clear === best.clear && cent < best.cent)) {
                best = { x, y, clear, cent };
            }
        }
    }
    return best ? { x: best.x, y: best.y, roomName: input.roomName } : undefined;
}

/** Step 3: core stamp with parity-preserving fallback (radius ≤ 5) or omission. */
function placeCoreStamp(ctx: Ctx, anchor: Pos): void {
    const parity = (anchor.x + anchor.y) % 2;
    if ((ctx.places[STRUCTURE_SPAWN]?.length ?? 0) === 0) {
        // No existing spawn (expansion/wipe-no-plan): spawn1 goes on the anchor itself.
        claim(ctx, STRUCTURE_SPAWN, anchor);
    }
    for (const { type, dx, dy } of CORE_STAMP) {
        if ((ctx.places[type]?.length ?? 0) >= (RCL8_LIMITS[type] ?? 0)) continue;
        const ix = anchor.x + dx;
        const iy = anchor.y + dy;
        let placed = false;
        if (validGeneric(ctx, ix, iy)) {
            claim(ctx, type, { x: ix, y: iy, roomName: ctx.input.roomName });
            placed = true;
        } else {
            // Nearest valid same-parity tile within chebyshev 5 of the intended offset.
            for (let r = 1; r <= 5 && !placed; r++) {
                const ring: { x: number; y: number }[] = [];
                for (let y = iy - r; y <= iy + r; y++) {
                    for (let x = ix - r; x <= ix + r; x++) {
                        if (Math.max(Math.abs(x - ix), Math.abs(y - iy)) !== r) continue;
                        if ((x + y) % 2 !== parity) continue;
                        ring.push({ x, y });
                    }
                }
                ring.sort((a, b) => a.y - b.y || a.x - b.x);
                for (const t of ring) {
                    if (validGeneric(ctx, t.x, t.y)) {
                        claim(ctx, type, { x: t.x, y: t.y, roomName: ctx.input.roomName });
                        placed = true;
                        break;
                    }
                }
            }
        }
        // Not placed within radius 5 → omitted from the plan (layout.md step 3).
    }
}

/** Container tile rule: bounds [1,48], walkable, not blocked by an obstacle. */
function validContainerTile(ctx: Ctx, x: number, y: number): boolean {
    if (x < 1 || x > 48 || y < 1 || y > 48 || ctx.input.terrain.isWall(x, y)) return false;
    return !ctx.blocked.has(pack(x, y)) && !ctx.claimed.has(pack(x, y));
}

/** Step 4: containers — adopt-or-plan, [sources…, controller] order. */
function placeContainers(ctx: Ctx): Pos | undefined {
    const { input, anchorDist } = ctx;
    const existing = input.structures.filter(s => s.type === STRUCTURE_CONTAINER).map(s => s.pos);
    const dOf = (p: Pos): number => {
        const d = anchorDist[pack(p.x, p.y)];
        return d === -1 ? Infinity : d;
    };
    const used = new Set<number>();
    const ordered = [...input.sources].sort((a, b) => dOf(a) - dOf(b) || byYX(a, b));
    for (const source of ordered) {
        const adopted = existing
            .filter(p => cheb(p.x, p.y, source) <= 1 && !used.has(pack(p.x, p.y)))
            .sort(byYX)[0];
        if (adopted) {
            used.add(pack(adopted.x, adopted.y));
            (ctx.places[STRUCTURE_CONTAINER] ??= []).push(adopted);
            continue;
        }
        let best: Pos | undefined;
        for (const [dx, dy] of NEIGHBORS) {
            const x = source.x + dx;
            const y = source.y + dy;
            if (!validContainerTile(ctx, x, y)) continue;
            const cand = { x, y, roomName: input.roomName };
            if (!best || dOf(cand) < dOf(best) || (dOf(cand) === dOf(best) && byYX(cand, best) < 0)) {
                best = cand;
            }
        }
        if (best) {
            claim(ctx, STRUCTURE_CONTAINER, best);
        }
    }
    // Controller container: adopt within range 3, else range-2 ring with ≥3 walkable neighbors.
    const ctrl = input.controller;
    let ctrlContainer = existing
        .filter(p => cheb(p.x, p.y, ctrl) <= 3 && !used.has(pack(p.x, p.y)))
        .sort(byYX)[0];
    if (ctrlContainer) {
        used.add(pack(ctrlContainer.x, ctrlContainer.y));
        (ctx.places[STRUCTURE_CONTAINER] ??= []).push(ctrlContainer);
    } else {
        let best: Pos | undefined;
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
                const x = ctrl.x + dx;
                const y = ctrl.y + dy;
                if (!validContainerTile(ctx, x, y)) continue;
                let walkable = 0;
                for (const [nx, ny] of NEIGHBORS) {
                    if (inRoom(x + nx, y + ny) && !input.terrain.isWall(x + nx, y + ny)) walkable++;
                }
                if (walkable < 3) continue;
                const cand = { x, y, roomName: input.roomName };
                const dBest = best ? (anchorDist[pack(best.x, best.y)] === -1 ? Infinity : anchorDist[pack(best.x, best.y)]) : Infinity;
                const dCand = anchorDist[pack(x, y)] === -1 ? Infinity : anchorDist[pack(x, y)];
                if (!best || dCand < dBest || (dCand === dBest && byYX(cand, best) < 0)) {
                    best = cand;
                }
            }
        }
        if (best) {
            claim(ctx, STRUCTURE_CONTAINER, best);
            ctrlContainer = best;
        }
    }
    // Remaining adopted-elsewhere containers keep their tiles on-plan (capped at 5).
    for (const p of existing.sort(byYX)) {
        const key = pack(p.x, p.y);
        if (used.has(key)) continue;
        const already = (ctx.places[STRUCTURE_CONTAINER] ?? []).some(q => q.x === p.x && q.y === p.y);
        if (!already && (ctx.places[STRUCTURE_CONTAINER]?.length ?? 0) < 5) {
            (ctx.places[STRUCTURE_CONTAINER] ??= []).push(p);
        }
    }
    return ctrlContainer;
}

/** Step 6: extension field — BFS order, anchor parity, first 60 valid. */
function placeExtensions(ctx: Ctx, anchor: Pos): void {
    const parity = (anchor.x + anchor.y) % 2;
    const want = 60 - (ctx.places[STRUCTURE_EXTENSION]?.length ?? 0);
    let placed = 0;
    for (const { x, y } of bfsOrder(ctx.input.terrain, anchor)) {
        if (placed >= want) break;
        if ((x + y) % 2 !== parity) continue;
        if (!validGeneric(ctx, x, y)) continue;
        claim(ctx, STRUCTURE_EXTENSION, { x, y, roomName: ctx.input.roomName });
        placed++;
    }
}

/** Step 7: the 4×3 lab block. Returns interior road tiles to append to roads. */
function placeLabBlock(ctx: Ctx): Pos[] {
    const want = 10 - (ctx.places[STRUCTURE_LAB]?.length ?? 0);
    if (want <= 0) return [];
    const anchor = ctx.places[STRUCTURE_SPAWN]![0];
    for (const { x, y } of bfsOrder(ctx.input.terrain, anchor)) {
        let fits = true;
        for (let dy = 0; dy <= 2 && fits; dy++) {
            for (let dx = 0; dx <= 3 && fits; dx++) {
                if (!validGeneric(ctx, x + dx, y + dy)) fits = false;
            }
        }
        if (!fits) continue;
        const rn = ctx.input.roomName;
        // Inputs first — relative (1,0), (2,0) — then the rest in (y,x) order.
        const labs: Pos[] = [
            { x: x + 1, y, roomName: rn },
            { x: x + 2, y, roomName: rn },
            { x, y, roomName: rn },
            { x: x + 3, y, roomName: rn },
            { x, y: y + 1, roomName: rn },
            { x: x + 3, y: y + 1, roomName: rn },
            { x, y: y + 2, roomName: rn },
            { x: x + 1, y: y + 2, roomName: rn },
            { x: x + 2, y: y + 2, roomName: rn },
            { x: x + 3, y: y + 2, roomName: rn }
        ];
        for (const lab of labs.slice(0, want)) {
            claim(ctx, STRUCTURE_LAB, lab);
        }
        const roads = [
            { x: x + 1, y: y + 1, roomName: rn },
            { x: x + 2, y: y + 1, roomName: rn }
        ];
        for (const r of roads) {
            ctx.claimed.add(pack(r.x, r.y));
        }
        return roads;
    }
    return [];
}

/** Step 8: links next to storage / controller container / source containers. */
function placeLinks(ctx: Ctx, ctrlContainer: Pos | undefined): void {
    const { input } = ctx;
    const hosts: { host: Pos | undefined; extra?: (x: number, y: number) => boolean }[] = [
        { host: ctx.places[STRUCTURE_STORAGE]?.[0] },
        {
            host: ctrlContainer,
            extra: (x, y) => cheb(x, y, input.controller) >= 3
        },
        ...input.sources.map(source => ({
            host: (ctx.places[STRUCTURE_CONTAINER] ?? []).find(c => cheb(c.x, c.y, source) <= 1),
            extra: (x: number, y: number) => cheb(x, y, source) >= 2
        }))
    ];
    for (const { host, extra } of hosts) {
        if (!host) continue;
        if ((ctx.places[STRUCTURE_LINK]?.length ?? 0) >= 6) break;
        let best: Pos | undefined;
        for (const [dx, dy] of NEIGHBORS) {
            const x = host.x + dx;
            const y = host.y + dy;
            if (x < 2 || x > 47 || y < 2 || y > 47 || input.terrain.isWall(x, y)) continue;
            if (ctx.claimed.has(pack(x, y))) continue;
            if (extra && !extra(x, y)) continue;
            const cand = { x, y, roomName: input.roomName };
            if (!best || byYX(cand, best) < 0) {
                best = cand;
            }
        }
        if (best) {
            claim(ctx, STRUCTURE_LINK, best);
        }
    }
}

/** Step 9: Dijkstra roads anchor → containers; planned roads cost 1 for reuse. */
function placeRoads(ctx: Ctx, anchor: Pos, ctrlContainer: Pos | undefined, labRoads: Pos[]): void {
    const { input, anchorDist } = ctx;
    const roadSet = new Set<number>();
    for (const s of input.structures) {
        if (s.type === STRUCTURE_ROAD) roadSet.add(pack(s.pos.x, s.pos.y));
    }
    const containers = ctx.places[STRUCTURE_CONTAINER] ?? [];
    const dOf = (p: Pos): number => {
        const d = anchorDist[pack(p.x, p.y)];
        return d === -1 ? Infinity : d;
    };
    const sourceContainers = input.sources
        .map(source => containers.find(c => cheb(c.x, c.y, source) <= 1))
        .filter((c): c is Pos => c !== undefined)
        .sort((a, b) => dOf(a) - dOf(b) || byYX(a, b));
    const targets = [...sourceContainers, ...(ctrlContainer ? [ctrlContainer] : [])];

    const startP = pack(anchor.x, anchor.y);
    const plannedRoads: Pos[] = [];
    for (const target of targets) {
        const targetP = pack(target.x, target.y);
        // Dijkstra: anchor exempt from its own blocked status; containers walkable.
        const dist = new Float64Array(2500).fill(Infinity);
        const prev = new Int32Array(2500).fill(-1);
        dist[startP] = 0;
        const open: number[] = [startP];
        while (open.length > 0) {
            let bi = 0;
            for (let i = 1; i < open.length; i++) {
                if (dist[open[i]] < dist[open[bi]] || (dist[open[i]] === dist[open[bi]] && open[i] < open[bi])) bi = i;
            }
            const p = open.splice(bi, 1)[0];
            if (p === targetP) break;
            const x = p % 50;
            const y = Math.floor(p / 50);
            for (const [dx, dy] of NEIGHBORS) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 1 || nx > 48 || ny < 1 || ny > 48 || input.terrain.isWall(nx, ny)) continue;
                const np = pack(nx, ny);
                if (ctx.blocked.has(np) && np !== targetP) continue;
                const cost = roadSet.has(np) ? 1 : input.terrain.isSwamp(nx, ny) ? 10 : 2;
                if (dist[p] + cost < dist[np]) {
                    dist[np] = dist[p] + cost;
                    prev[np] = p;
                    if (!open.includes(np)) open.push(np);
                }
            }
        }
        if (dist[targetP] === Infinity) continue;
        const path: number[] = [];
        for (let p = targetP; p !== startP && p !== -1; p = prev[p]) {
            path.push(p);
        }
        path.reverse();
        for (const p of path) {
            if (p === targetP || roadSet.has(p) || ctx.claimed.has(p)) continue;
            roadSet.add(p);
            plannedRoads.push(unpack(p, input.roomName));
        }
    }
    const existingRoads = input.structures
        .filter(s => s.type === STRUCTURE_ROAD)
        .map(s => s.pos)
        .sort(byYX);
    ctx.places[STRUCTURE_ROAD] = [...existingRoads, ...plannedRoads, ...labRoads];
}

/** Step 10: ramparts on every planned/incorporated critical structure. */
function placeRamparts(ctx: Ctx): void {
    const criticals: Pos[] = [
        ...(ctx.places[STRUCTURE_SPAWN] ?? []),
        ...(ctx.places[STRUCTURE_TOWER] ?? []),
        ...(ctx.places[STRUCTURE_STORAGE] ?? []),
        ...(ctx.places[STRUCTURE_TERMINAL] ?? [])
    ];
    const seen = new Set<number>();
    const ramparts: Pos[] = [];
    for (const pos of criticals) {
        const p = pack(pos.x, pos.y);
        if (!seen.has(p)) {
            seen.add(p);
            ramparts.push(pos);
        }
    }
    for (const s of ctx.input.structures) {
        if (s.type !== STRUCTURE_RAMPART) continue;
        const p = pack(s.pos.x, s.pos.y);
        if (!seen.has(p)) {
            seen.add(p);
            ramparts.push(s.pos);
        }
    }
    ctx.places[STRUCTURE_RAMPART] = ramparts;
}

export function planBase(input: LayoutInput): BasePlan | undefined {
    const anchor = chooseAnchor(input);
    if (!anchor) {
        return undefined;
    }
    const ctx: Ctx = {
        input,
        anchorDist: bfsDistances(input.terrain, anchor),
        claimed: new Set(),
        blocked: new Set(),
        places: {}
    };
    incorporate(ctx);
    placeCoreStamp(ctx, anchor);
    const ctrlContainer = placeContainers(ctx);
    if (input.mineral && (ctx.places[STRUCTURE_EXTRACTOR]?.length ?? 0) === 0) {
        claim(ctx, STRUCTURE_EXTRACTOR, input.mineral);
    }
    placeExtensions(ctx, anchor);
    const labRoads = placeLabBlock(ctx);
    placeLinks(ctx, ctrlContainer);
    placeRoads(ctx, anchor, ctrlContainer, labRoads);
    placeRamparts(ctx);
    return {
        anchor,
        ...(ctrlContainer ? { controllerContainer: ctrlContainer } : {}),
        places: ctx.places
    };
}
