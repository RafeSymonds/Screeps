import { IntelStatus, intelStatus } from "./RoomIntel";
import { getDefaultRoomMemory } from "./RoomMemory";
import { buildNeighborMap } from "./RoomTopology";

const routeCache = new Map<string, string[] | null>();

export function clearRouteCache(): void {
    routeCache.clear();
}

function routeKey(start: string, goal: string): string {
    return start + "->" + goal;
}

function getNeighbors(roomName: string): string[] {
    const roomMemory = Memory.rooms[roomName] || getDefaultRoomMemory();

    if (!roomMemory.topology) {
        roomMemory.topology = { neighbors: buildNeighborMap(roomName) };
        Memory.rooms[roomName] = roomMemory;
    }

    return Object.values(roomMemory.topology.neighbors);
}

function isBlocked(roomName: string, start: string, goal: string): boolean {
    if (roomName === start || roomName === goal) {
        return false;
    }

    return intelStatus(Memory.rooms[roomName]?.intel) === IntelStatus.DANGEROUS;
}

export function findSafeInterRoomRoute(start: string, goal: string): string[] | null {
    const key = routeKey(start, goal);

    if (routeCache.has(key)) {
        return routeCache.get(key)!;
    }

    if (start === goal) {
        const path = [start];
        routeCache.set(key, path);
        return path;
    }

    const queue: string[] = [start];
    const cameFrom = new Map<string, string | null>();
    cameFrom.set(start, null);

    while (queue.length > 0) {
        const current = queue.shift()!;

        for (const next of getNeighbors(current)) {
            if (cameFrom.has(next) || isBlocked(next, start, goal)) {
                continue;
            }

            cameFrom.set(next, current);

            if (next === goal) {
                const path: string[] = [];

                for (let room: string | null = goal; room; room = cameFrom.get(room)!) {
                    path.push(room);
                }

                path.reverse();
                routeCache.set(key, path);
                return path;
            }

            queue.push(next);
        }
    }

    routeCache.set(key, null);
    return null;
}

export function estimateSafeRouteLength(start: string, goal: string): number | null {
    const route = findSafeInterRoomRoute(start, goal);

    if (!route) {
        return null;
    }

    return Math.max(0, route.length - 1);
}

export function nextRoomWaypoint(currentRoom: string, target: RoomPosition): RoomPosition {
    const route = findSafeInterRoomRoute(currentRoom, target.roomName);

    if (!route || route.length < 2) {
        return target;
    }

    const nextRoom = route[1];

    if (nextRoom === target.roomName) {
        return target;
    }

    return new RoomPosition(25, 25, nextRoom);
}
