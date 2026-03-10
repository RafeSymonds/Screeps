import { Plan } from "./Plan";
import { remoteAssignmentForRoom } from "rooms/RemoteStrategy";
import { World } from "world/World";

const MAX_NEW_SITES_PER_RUN = 6;

function isWalkable(pos: RoomPosition): boolean {
    const terrain = Game.map.getRoomTerrain(pos.roomName);

    if (terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL) {
        return false;
    }

    return !pos.lookFor(LOOK_STRUCTURES).some(
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

function planContainerAt(pos: RoomPosition): boolean {
    if (hasStructureOrSite(pos, STRUCTURE_CONTAINER)) {
        return false;
    }

    return pos.createConstructionSite(STRUCTURE_CONTAINER) === OK;
}

function planRoads(path: RoomPosition[], created: { count: number }) {
    for (const pos of path) {
        if (created.count >= MAX_NEW_SITES_PER_RUN || Object.keys(Game.constructionSites).length >= MAX_CONSTRUCTION_SITES) {
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

function planOwnedRoomInfrastructure(room: Room, created: { count: number }) {
    const anchor = getAnchor(room);

    if (!anchor) {
        return;
    }

    for (const source of room.find(FIND_SOURCES)) {
        const containerPos = bestContainerPosition(anchor.pos, source);

        if (containerPos && created.count < MAX_NEW_SITES_PER_RUN && Object.keys(Game.constructionSites).length < MAX_CONSTRUCTION_SITES) {
            if (planContainerAt(containerPos)) {
                created.count += 1;
            }
        }

        const targetPos = containerPos ?? source.pos;
        planRoads(createRoadPath(anchor.pos, targetPos), created);
    }

    if (room.controller) {
        planRoads(createRoadPath(anchor.pos, room.controller.pos), created);
    }
}

function planRemoteInfrastructure(ownerRoom: Room, remoteRoom: Room, created: { count: number }) {
    const anchor = getAnchor(ownerRoom);

    if (!anchor) {
        return;
    }

    for (const source of remoteRoom.find(FIND_SOURCES)) {
        const containerPos = bestContainerPosition(anchor.pos, source);

        if (containerPos && created.count < MAX_NEW_SITES_PER_RUN && Object.keys(Game.constructionSites).length < MAX_CONSTRUCTION_SITES) {
            if (planContainerAt(containerPos)) {
                created.count += 1;
            }
        }

        const targetPos = containerPos ?? source.pos;
        planRoads(createRoadPath(anchor.pos, targetPos), created);
    }
}

export class InfrastructurePlan extends Plan {
    public override run(world: World): void {
        const created = { count: 0 };

        for (const [, worldRoom] of world.rooms) {
            if (created.count >= MAX_NEW_SITES_PER_RUN) {
                return;
            }

            const room = worldRoom.room;

            if (!room.controller?.my) {
                continue;
            }

            planOwnedRoomInfrastructure(room, created);

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
                }
            }
        }
    }
}
