import { EXTENSION_PLAN_RADIUS, MAX_SITES_PER_RUN } from "config/constants";
import { BasePlan } from "base/types";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";

/**
 * Minimal base planning: anchor on the first spawn, place source containers
 * (which unlock static mining + the hauler economy) and RCL-gated extensions in
 * a checkerboard around the anchor. It emits construction sites; the Build job
 * generator turns those into jobs. Full stamps/roads/labs/links come later.
 */
export function planBase(world: World): void {
    for (const worldRoom of world.myRooms) {
        const plan = basePlanMemory(worldRoom.name);
        const anchor = ensureAnchor(worldRoom, plan);
        if (!anchor) {
            continue;
        }
        let budget = MAX_SITES_PER_RUN;
        budget -= ensureSourceContainers(worldRoom, budget);
        if (budget > 0) {
            ensureExtensions(worldRoom, anchor, budget);
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
