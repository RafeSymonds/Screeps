import {
    EXTENSION_PLAN_RADIUS,
    MAX_ROAD_SITES_PER_RUN,
    MAX_SITES_PER_RUN,
    ROAD_PLAN_MIN_RCL,
    STORAGE_MIN_RCL
} from "config/constants";
import { BasePlan } from "base/types";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";

type Tile = { x: number; y: number };

// Source containers are a mining *optimization*, not a speed lever (drop-mining
// works without them). Defer them until the room has its early extensions and is
// upgrading, so the build budget goes to capacity/RCL first — "speed before
// containers". Kept local to avoid contending on the shared constants file.
const CONTAINER_MIN_RCL = 3;

/**
 * Base planning: anchor on the first spawn, place source containers (which
 * unlock static mining + the hauler economy), RCL-gated extensions in a
 * checkerboard, storage at RCL4, and a road network on the hauling lanes. It
 * emits construction sites; the Build job generator turns those into jobs. Full
 * stamps/labs/links come later.
 */
export function planBase(world: World): void {
    for (const worldRoom of world.myRooms) {
        const plan = basePlanMemory(worldRoom.name);
        const anchor = ensureAnchor(worldRoom, plan);
        if (!anchor) {
            continue;
        }
        // Speed before optimization: spend the shared build budget on extensions
        // (more spawn capacity -> bigger miners/haulers/workers) first, then storage,
        // and only then the mining-optimization source containers (gated by RCL). At
        // RCL1 none of these are allowed yet, so workers fall back to upgrading — the
        // fastest path to RCL2.
        let budget = MAX_SITES_PER_RUN;
        budget -= ensureExtensions(worldRoom, anchor, budget);
        if (budget > 0 && worldRoom.rcl >= STORAGE_MIN_RCL) {
            budget -= ensureStorage(worldRoom, anchor, plan);
        }
        if (budget > 0 && worldRoom.rcl >= CONTAINER_MIN_RCL) {
            budget -= ensureSourceContainers(worldRoom, budget);
        }
        // Roads use a separate budget so they never starve extension growth.
        if (worldRoom.rcl >= ROAD_PLAN_MIN_RCL) {
            ensureRoads(worldRoom, anchor, plan, MAX_ROAD_SITES_PER_RUN);
        }
    }
}

function basePlanMemory(roomName: string): BasePlan {
    const roomMemory = Memory.rooms[roomName] ?? (Memory.rooms[roomName] = {});
    if (!roomMemory.base) {
        roomMemory.base = {};
    }
    return roomMemory.base;
}

function ensureAnchor(worldRoom: WorldRoom, plan: BasePlan): { x: number; y: number } | undefined {
    if (plan.anchor) {
        return plan.anchor;
    }
    const spawn = worldRoom.spawns[0];
    if (!spawn) {
        return undefined;
    }
    plan.anchor = { x: spawn.pos.x, y: spawn.pos.y };
    return plan.anchor;
}

function ensureSourceContainers(worldRoom: WorldRoom, budget: number): number {
    let placed = 0;
    for (const source of worldRoom.sources) {
        if (placed >= budget) {
            break;
        }
        const hasContainer =
            source.pos.findInRange(FIND_STRUCTURES, 1).some(s => s.structureType === STRUCTURE_CONTAINER) ||
            source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1).some(s => s.structureType === STRUCTURE_CONTAINER);
        if (hasContainer) {
            continue;
        }
        const spot = openTileAdjacent(source.pos, worldRoom.room);
        if (spot && worldRoom.room.createConstructionSite(spot.x, spot.y, STRUCTURE_CONTAINER) === OK) {
            placed++;
        }
    }
    return placed;
}

function ensureExtensions(worldRoom: WorldRoom, anchor: { x: number; y: number }, budget: number): number {
    const allowed = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][worldRoom.rcl] ?? 0;
    const existing =
        worldRoom.extensions.length +
        worldRoom.constructionSites.filter(site => site.structureType === STRUCTURE_EXTENSION).length;
    let remaining = Math.min(budget, allowed - existing);
    if (remaining <= 0) {
        return 0;
    }

    const terrain = worldRoom.room.getTerrain();
    let placed = 0;
    for (let ring = 1; ring <= EXTENSION_PLAN_RADIUS && remaining > 0; ring++) {
        for (let dx = -ring; dx <= ring && remaining > 0; dx++) {
            for (let dy = -ring; dy <= ring && remaining > 0; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) {
                    continue; // only the outer ring at this radius
                }
                const x = anchor.x + dx;
                const y = anchor.y + dy;
                if (x < 2 || x > 47 || y < 2 || y > 47) {
                    continue;
                }
                if ((x + y) % 2 !== 0) {
                    continue; // checkerboard leaves road lanes between extensions
                }
                if ((terrain.get(x, y) & TERRAIN_MASK_WALL) !== 0) {
                    continue;
                }
                if (worldRoom.room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) {
                    continue;
                }
                if (worldRoom.room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) {
                    continue;
                }
                if (worldRoom.room.createConstructionSite(x, y, STRUCTURE_EXTENSION) === OK) {
                    placed++;
                    remaining--;
                }
            }
        }
    }
    return placed;
}

/**
 * Place a single storage near the anchor once the controller allows it. The tile
 * is recomputed each run (deterministic scan) until storage is actually built,
 * so a blocked spot self-heals to the next open tile.
 */
function ensureStorage(worldRoom: WorldRoom, anchor: Tile, plan: BasePlan): number {
    if (worldRoom.storage) {
        return 0;
    }
    if ((CONTROLLER_STRUCTURES[STRUCTURE_STORAGE][worldRoom.rcl] ?? 0) <= 0) {
        return 0;
    }
    if (worldRoom.constructionSites.some(site => site.structureType === STRUCTURE_STORAGE)) {
        return 0;
    }
    const spot = openTileNearAnchor(anchor, worldRoom.room);
    if (!spot) {
        return 0;
    }
    plan.storagePos = spot;
    return worldRoom.room.createConstructionSite(spot.x, spot.y, STRUCTURE_STORAGE) === OK ? 1 : 0;
}

/**
 * Lay roads along the hauling lanes (anchor↔sources, anchor↔controller). The
 * path set is computed once and cached in the plan; each run places road sites
 * for cached tiles that are still open, up to the road budget.
 */
function ensureRoads(worldRoom: WorldRoom, anchor: Tile, plan: BasePlan, budget: number): number {
    if (!plan.roads) {
        plan.roads = computeRoadPlan(worldRoom, anchor);
    }
    let placed = 0;
    for (const tile of plan.roads) {
        if (placed >= budget) {
            break;
        }
        if (!shouldPlaceRoad(worldRoom.room, tile)) {
            continue;
        }
        if (worldRoom.room.createConstructionSite(tile.x, tile.y, STRUCTURE_ROAD) === OK) {
            placed++;
        }
    }
    return placed;
}

function computeRoadPlan(worldRoom: WorldRoom, anchor: Tile): Tile[] {
    const anchorPos = new RoomPosition(anchor.x, anchor.y, worldRoom.name);
    const targets: RoomPosition[] = worldRoom.sources.map(source => source.pos);
    if (worldRoom.controller) {
        targets.push(worldRoom.controller.pos);
    }
    const tiles = new Map<string, Tile>();
    for (const target of targets) {
        const path = worldRoom.room.findPath(anchorPos, target, {
            ignoreCreeps: true,
            swampCost: 2,
            range: 1
        });
        for (const step of path) {
            tiles.set(`${step.x},${step.y}`, { x: step.x, y: step.y });
        }
    }
    return [...tiles.values()];
}

/** A road belongs here only if the tile is empty (no structure or pending site). */
function shouldPlaceRoad(room: Room, tile: Tile): boolean {
    if (room.lookForAt(LOOK_STRUCTURES, tile.x, tile.y).length > 0) {
        return false;
    }
    return room.lookForAt(LOOK_CONSTRUCTION_SITES, tile.x, tile.y).length === 0;
}

function openTileNearAnchor(anchor: Tile, room: Room): Tile | undefined {
    const terrain = room.getTerrain();
    for (let radius = 1; radius <= 2; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
                    continue;
                }
                const x = anchor.x + dx;
                const y = anchor.y + dy;
                if (x < 2 || x > 47 || y < 2 || y > 47) {
                    continue;
                }
                if ((terrain.get(x, y) & TERRAIN_MASK_WALL) !== 0) {
                    continue;
                }
                if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) {
                    continue;
                }
                if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) {
                    continue;
                }
                return { x, y };
            }
        }
    }
    return undefined;
}

function openTileAdjacent(pos: RoomPosition, room: Room): { x: number; y: number } | undefined {
    const terrain = room.getTerrain();
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) {
                continue;
            }
            const x = pos.x + dx;
            const y = pos.y + dy;
            if (x < 1 || x > 48 || y < 1 || y > 48) {
                continue;
            }
            if ((terrain.get(x, y) & TERRAIN_MASK_WALL) !== 0) {
                continue;
            }
            if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) {
                continue;
            }
            if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) {
                continue;
            }
            return { x, y };
        }
    }
    return undefined;
}
