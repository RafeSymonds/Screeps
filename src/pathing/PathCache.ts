import { getRoomCostMatrix } from "./CostMatrixFactory";

interface CachedPath {
    path: RoomPosition[];
    lastUsed: number;
}

const pathCache = new Map<string, CachedPath>();
const CACHE_TTL = 15;
const MAX_CACHE_SIZE = 500;

function sectorKey(pos: RoomPosition): string {
    const sx = (pos.x / 5) | 0;
    const sy = (pos.y / 5) | 0;
    return `${pos.roomName}:${sx}:${sy}`;
}

function pathKey(from: RoomPosition, to: RoomPosition): string {
    return `${sectorKey(from)}->${sectorKey(to)}`;
}

export function findCachedPath(from: RoomPosition, to: RoomPosition): RoomPosition[] | null {
    const key = pathKey(from, to);
    const entry = pathCache.get(key);

    if (!entry) return null;

    entry.lastUsed = Game.time;
    return entry.path;
}

export function searchAndCachePath(from: RoomPosition, to: RoomPosition, range: number = 1): RoomPosition[] {
    const result = PathFinder.search(
        from,
        { pos: to, range },
        {
            plainCost: 2,
            swampCost: 10,
            maxOps: 2000,
            roomCallback: getRoomCostMatrix
        }
    );

    if (result.incomplete) {
        return result.path;
    }

    const key = pathKey(from, to);
    pathCache.set(key, { path: result.path, lastUsed: Game.time });

    return result.path;
}

export function clearStalePaths(): void {
    if (Game.time % 10 !== 0) return;

    for (const [key, entry] of pathCache) {
        if (Game.time - entry.lastUsed > CACHE_TTL) {
            pathCache.delete(key);
        }
    }

    if (pathCache.size > MAX_CACHE_SIZE) {
        const entries = [...pathCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
        const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
        for (const [key] of toRemove) {
            pathCache.delete(key);
        }
    }
}
