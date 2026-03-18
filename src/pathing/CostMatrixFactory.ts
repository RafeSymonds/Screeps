let cachedTick = -1;
const matrixCache = new Map<string, CostMatrix>();

export function getRoomCostMatrix(roomName: string): CostMatrix | false {
    if (cachedTick !== Game.time) {
        matrixCache.clear();
        cachedTick = Game.time;
    }

    if (matrixCache.has(roomName)) {
        return matrixCache.get(roomName)!;
    }

    const room = Game.rooms[roomName];
    if (!room) {
        return false;
    }

    const matrix = new PathFinder.CostMatrix();

    for (const struct of room.find(FIND_STRUCTURES)) {
        if (struct.structureType === STRUCTURE_ROAD) {
            matrix.set(struct.pos.x, struct.pos.y, 1);
        } else if (
            struct.structureType !== STRUCTURE_CONTAINER &&
            !(struct.structureType === STRUCTURE_RAMPART && struct.my)
        ) {
            matrix.set(struct.pos.x, struct.pos.y, 255);
        }
    }

    for (const site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
        if (
            site.structureType !== STRUCTURE_ROAD &&
            site.structureType !== STRUCTURE_CONTAINER &&
            site.structureType !== STRUCTURE_RAMPART
        ) {
            matrix.set(site.pos.x, site.pos.y, 255);
        }
    }

    // Add creep positions as soft obstacles so paths route around them
    for (const creep of room.find(FIND_CREEPS)) {
        matrix.set(creep.pos.x, creep.pos.y, 20);
    }

    matrixCache.set(roomName, matrix);
    return matrix;
}
