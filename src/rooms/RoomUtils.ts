import { buildNeighborMap, isNeightborEmpty } from "./RoomTopology";
import { getDefaultRoomMemory } from "./RoomMemory";

export function roomsWithin(roomName: string, maxDepth: number): Set<string> {
    const visited = new Set<string>([roomName]);
    const result = new Set<string>();
    const queue: [string, number][] = [[roomName, 0]];

    while (queue.length) {
        const [current, depth] = queue.shift()!;
        if (depth === maxDepth) continue;

        let exits = Memory.rooms[current]?.topology?.neighbors;

        if (!exits || isNeightborEmpty(exits)) {
            exits = buildNeighborMap(current);

            const existingRoomMemory = Memory.rooms[current] || getDefaultRoomMemory();

            existingRoomMemory.topology = { neighbors: exits };

            Memory.rooms[current] = existingRoomMemory;
        }

        for (const next of Object.values(exits)) {
            if (visited.has(next)) continue;
            visited.add(next);
            result.add(next);
            queue.push([next, depth + 1]);
        }
    }

    return result;
}

export function ownedRooms(): Room[] {
    return Object.values(Game.rooms).filter(r => r.controller?.my);
}

export function containerIsSourceTied(container: StructureContainer): boolean {
    return (
        container.pos.findInRange(FIND_SOURCES, 1).length > 0 || container.pos.findInRange(FIND_MINERALS, 1).length > 0
    );
}
