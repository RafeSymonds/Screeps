export function getAdjacentPosition(pos: RoomPosition, opts?: { requireWalkable?: boolean }): RoomPosition | null {
    const terrain = Game.map.getRoomTerrain(pos.roomName);
    const offsets = [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1]
    ];

    for (const [dx, dy] of offsets) {
        const x = pos.x + dx;
        const y = pos.y + dy;
        if (x < 0 || x > 49 || y < 0 || y > 49) continue;

        if (opts?.requireWalkable !== false) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            // Skip tiles occupied by blocking structures
            const objects = Game.rooms[pos.roomName]?.lookForAt(LOOK_STRUCTURES, x, y) ?? [];
            if (objects.some(o => o.structureType !== STRUCTURE_ROAD && o.structureType !== STRUCTURE_CONTAINER)) {
                continue;
            }
        }

        return new RoomPosition(x, y, pos.roomName);
    }

    return null;
}
