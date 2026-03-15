import { CreepState } from "creeps/CreepState";
import { findCachedPath, searchAndCachePath } from "./PathCache";

export function cachedMoveTo(creepState: CreepState, target: RoomPosition, range: number = 1): void {
    const creep = creepState.creep;
    const pos = creep.pos;

    if (pos.getRangeTo(target) <= range) return;

    // Check for existing cached path
    let path = findCachedPath(pos, target);

    if (!path || path.length === 0) {
        path = searchAndCachePath(pos, target, range);
    }

    if (!path || path.length === 0) return;

    // Find closest point on path to current position
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < Math.min(path.length, 5); i++) {
        const dist = pos.getRangeTo(path[i]);
        if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
        }
    }

    // If we're on the path or adjacent to it, follow it
    if (bestDist <= 1) {
        const nextIdx = bestDist === 0 ? bestIdx + 1 : bestIdx;
        if (nextIdx < path.length) {
            const next = path[nextIdx];
            const dir = pos.getDirectionTo(next);
            creep.move(dir);
            creepState.moved = true;
            return;
        }
    }

    // Fallback: direct pathfind to first path point or target
    const fallbackTarget = path[0] && pos.getRangeTo(path[0]) > 1 ? path[0] : target;
    creep.moveTo(fallbackTarget, { reusePath: 5 });
    creepState.moved = true;
}
