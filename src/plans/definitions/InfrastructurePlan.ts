import { Plan } from "./Plan";
import { remoteAssignmentForRoom } from "rooms/RemoteStrategy";
import { World } from "world/World";
import { createBuildTaskData } from "tasks/definitions/BuildTask";

const MAX_NEW_SITES_PER_RUN = 6;

type SitePriority = "extension" | "container" | "link" | "road" | "extractor";

interface PlannedSite {
    pos: RoomPosition;
    type: BuildableStructureConstant;
    priority: SitePriority;
}

function sitePriorityOrder(type: BuildableStructureConstant): number {
    switch (type) {
        case STRUCTURE_EXTENSION:
            return 0;
        case STRUCTURE_CONTAINER:
            return 1;
        case STRUCTURE_LINK:
            return 2;
        case STRUCTURE_ROAD:
            return 3;
        case STRUCTURE_EXTRACTOR:
            return 4;
        default:
            return 5;
    }
}

function isWalkable(pos: RoomPosition): boolean {
    const terrain = Game.map.getRoomTerrain(pos.roomName);

    if (terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL) {
        return false;
    }

    return !pos
        .lookFor(LOOK_STRUCTURES)
        .some(
            structure => structure.structureType !== STRUCTURE_ROAD && structure.structureType !== STRUCTURE_CONTAINER
        );
}

function hasStructureOrSite(pos: RoomPosition, structureType: BuildableStructureConstant): boolean {
    return (
        pos.lookFor(LOOK_STRUCTURES).some(structure => structure.structureType === structureType) ||
        pos.lookFor(LOOK_CONSTRUCTION_SITES).some(site => site.structureType === structureType)
    );
}

function getAnchor(room: Room): StructureSpawn | null {
    if (!room.memory.anchorSpawnId) {
        const spawn = room.find(FIND_MY_SPAWNS)[0];

        if (!spawn) {
            return null;
        }

        room.memory.anchorSpawnId = spawn.id;
    }

    return Game.getObjectById(room.memory.anchorSpawnId) ?? null;
}

function bestContainerPosition(anchor: RoomPosition, source: Source): RoomPosition | null {
    let bestPos: RoomPosition | null = null;
    let bestCost = Infinity;

    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const x = source.pos.x + dx;
            const y = source.pos.y + dy;

            if ((dx === 0 && dy === 0) || x <= 0 || x >= 49 || y <= 0 || y >= 49) {
                continue;
            }

            const pos = new RoomPosition(x, y, source.pos.roomName);

            if (!isWalkable(pos)) {
                continue;
            }

            const cost = anchor.getRangeTo(pos);

            if (cost < bestCost) {
                bestCost = cost;
                bestPos = pos;
            }
        }
    }

    return bestPos;
}

function createRoadPath(origin: RoomPosition, target: RoomPosition): RoomPosition[] {
    return PathFinder.search(origin, { pos: target, range: 1 }, { maxOps: 8000, swampCost: 4 }).path;
}

function planRoads(path: RoomPosition[], created: { count: number }) {
    for (const pos of path) {
        if (
            created.count >= MAX_NEW_SITES_PER_RUN ||
            Object.keys(Game.constructionSites).length >= MAX_CONSTRUCTION_SITES
        ) {
            return;
        }

        if (!isWalkable(pos) || hasStructureOrSite(pos, STRUCTURE_ROAD)) {
            continue;
        }

        if (pos.createConstructionSite(STRUCTURE_ROAD) === OK) {
            created.count += 1;
        }
    }
}

function planLinkNearSource(room: Room, source: Source, created: { count: number }) {
    const rcl = room.controller?.level ?? 0;

    if (rcl < 5) {
        return;
    }

    const existingLinks = room.find(FIND_MY_STRUCTURES).filter(s => s.structureType === STRUCTURE_LINK).length;
    const linkSites = room.find(FIND_CONSTRUCTION_SITES).filter(s => s.structureType === STRUCTURE_LINK).length;

    const linkLimits = [0, 0, 0, 0, 2, 3, 4, 6];
    const maxLinks = linkLimits[rcl - 1] ?? 0;

    if (existingLinks + linkSites >= maxLinks) {
        return;
    }

    const nearbyLinks = source.pos.findInRange(FIND_MY_STRUCTURES, 2).filter(s => s.structureType === STRUCTURE_LINK);
    const nearbySites = source.pos
        .findInRange(FIND_CONSTRUCTION_SITES, 2)
        .filter(s => s.structureType === STRUCTURE_LINK);

    if (nearbyLinks.length > 0 || nearbySites.length > 0) {
        return;
    }

    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;

            const x = source.pos.x + dx;
            const y = source.pos.y + dy;

            if (x <= 1 || x >= 48 || y <= 1 || y >= 48) continue;

            const pos = new RoomPosition(x, y, room.name);

            if (!isWalkable(pos)) continue;
            if (hasStructureOrSite(pos, STRUCTURE_LINK)) continue;
            if (hasStructureOrSite(pos, STRUCTURE_CONTAINER)) continue;

            if (pos.createConstructionSite(STRUCTURE_LINK) === OK) {
                created.count += 1;
                return;
            }
        }
    }
}

function planExtractor(room: Room, created: { count: number }) {
    const rcl = room.controller?.level ?? 0;

    if (rcl < 6) {
        return;
    }

    const minerals = room.find(FIND_MINERALS);

    if (minerals.length === 0) {
        return;
    }

    const mineral = minerals[0];

    if (hasStructureOrSite(mineral.pos, STRUCTURE_EXTRACTOR)) {
        return;
    }

    if (mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR) === OK) {
        created.count += 1;
    }
}

function planExtensions(room: Room, created: { count: number }) {
    const anchor = getAnchor(room);
    if (!anchor) return;

    const rcl = room.controller?.level ?? 0;
    const neededExtensions = (rcl + 1) * 2;
    const existingExtensions = room
        .find(FIND_MY_STRUCTURES)
        .filter(s => s.structureType === STRUCTURE_EXTENSION).length;
    const pendingExtensions = room
        .find(FIND_CONSTRUCTION_SITES)
        .filter(s => s.structureType === STRUCTURE_EXTENSION).length;
    const currentTotal = existingExtensions + pendingExtensions;

    if (currentTotal >= neededExtensions) return;

    const spawnRange = anchor.pos.getRangeTo(anchor.pos.findClosestByRange(FIND_MY_SPAWNS)!) <= 2 ? 1 : 2;

    for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -4; dy <= 4; dy++) {
            if (created.count >= MAX_NEW_SITES_PER_RUN) return;
            if (Object.keys(Game.constructionSites).length >= MAX_CONSTRUCTION_SITES) return;

            const x = anchor.pos.x + dx;
            const y = anchor.pos.y + dy;

            if (x <= 0 || x >= 49 || y <= 0 || y >= 49) continue;
            if (Math.abs(dx) + Math.abs(dy) < spawnRange) continue;

            const pos = new RoomPosition(x, y, room.name);

            if (!isWalkable(pos)) continue;
            if (hasStructureOrSite(pos, STRUCTURE_EXTENSION)) continue;

            if (pos.createConstructionSite(STRUCTURE_EXTENSION) === OK) {
                created.count += 1;
            }
        }
    }
}

function collectPlannedSites(room: Room, anchor: RoomPosition, created: { count: number }): PlannedSite[] {
    const sites: PlannedSite[] = [];
    const rcl = room.controller?.level ?? 0;

    for (const source of room.find(FIND_SOURCES)) {
        const containerPos = bestContainerPosition(anchor, source);
        if (containerPos && !hasStructureOrSite(containerPos, STRUCTURE_CONTAINER)) {
            sites.push({ pos: containerPos, type: STRUCTURE_CONTAINER, priority: "container" });
        }

        if (rcl >= 5) {
            planLinkNearSource(room, source, created);
        }
    }

    if (rcl >= 3 && room.controller) {
        const path = createRoadPath(anchor, room.controller.pos);
        for (const pos of path) {
            if (!isWalkable(pos) || hasStructureOrSite(pos, STRUCTURE_ROAD)) continue;
            sites.push({ pos, type: STRUCTURE_ROAD, priority: "road" });
        }
    }

    if (rcl >= 6) {
        const minerals = room.find(FIND_MINERALS);
        if (minerals.length > 0 && !hasStructureOrSite(minerals[0].pos, STRUCTURE_EXTRACTOR)) {
            sites.push({ pos: minerals[0].pos, type: STRUCTURE_EXTRACTOR, priority: "extractor" });
        }
    }

    return sites;
}

export class InfrastructurePlan extends Plan {
    public override run(world: World): void {
        const created = { count: 0 };

        for (const [, worldRoom] of world.rooms) {
            const room = worldRoom.room;

            if (!room.controller?.my) {
                continue;
            }

            if (created.count < MAX_NEW_SITES_PER_RUN) {
                planExtensions(room, created);
            }

            const anchor = getAnchor(room);
            if (!anchor) continue;

            const plannedSites = collectPlannedSites(room, anchor.pos, created);

            plannedSites.sort((a, b) => sitePriorityOrder(a.type) - sitePriorityOrder(b.type));

            for (const site of plannedSites) {
                if (created.count >= MAX_NEW_SITES_PER_RUN) break;
                if (Object.keys(Game.constructionSites).length >= MAX_CONSTRUCTION_SITES) break;

                if (isWalkable(site.pos) && !hasStructureOrSite(site.pos, site.type)) {
                    if (site.pos.createConstructionSite(site.type) === OK) {
                        created.count += 1;
                    }
                }
            }

            for (const [remoteRoomName, memory] of Object.entries(Memory.rooms)) {
                const strategy = remoteAssignmentForRoom(remoteRoomName);

                if (
                    created.count >= MAX_NEW_SITES_PER_RUN ||
                    strategy?.state !== "active" ||
                    strategy.ownerRoom !== room.name ||
                    !memory.remoteMining
                ) {
                    continue;
                }

                const visibleRemote = Game.rooms[remoteRoomName];

                if (visibleRemote) {
                    planRemoteInfrastructure(room, visibleRemote, created);

                    visibleRemote.find(FIND_CONSTRUCTION_SITES).forEach(site => {
                        world.taskManager.add(createBuildTaskData(site));
                    });
                }
            }
        }
    }
}

function planRemoteInfrastructure(ownerRoom: Room, remoteRoom: Room, created: { count: number }) {
    const anchor = getAnchor(ownerRoom);

    if (!anchor) {
        return;
    }

    for (const source of remoteRoom.find(FIND_SOURCES)) {
        const containerPos = bestContainerPosition(anchor.pos, source);

        if (
            containerPos &&
            created.count < MAX_NEW_SITES_PER_RUN &&
            Object.keys(Game.constructionSites).length < MAX_CONSTRUCTION_SITES
        ) {
            if (planContainerAt(containerPos)) {
                created.count += 1;
            }
        }

        const targetPos = containerPos ?? source.pos;
        planRoads(createRoadPath(anchor.pos, targetPos), created);
    }
}

function planContainerAt(pos: RoomPosition): boolean {
    if (hasStructureOrSite(pos, STRUCTURE_CONTAINER)) {
        return false;
    }

    return pos.createConstructionSite(STRUCTURE_CONTAINER) === OK;
}
