/**
 * Terrain-derived seat choices, computed once per room and persisted in the econ
 * slice. Pure over the TerrainGrid. See docs/design/economy.md "Memory Schema".
 */
import { Pos } from "shared/views";
import { TerrainGrid } from "snapshot/terrain";

function inBounds(x: number, y: number): boolean {
    return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function walkableNeighbors(terrain: TerrainGrid, x: number, y: number): number {
    let count = 0;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (inBounds(nx, ny) && !terrain.isWall(nx, ny)) {
                count++;
            }
        }
    }
    return count;
}

/** Walkable tiles adjacent to a position (miner seats around a source). */
export function countAdjacentSpots(terrain: TerrainGrid, pos: Pos): number {
    return walkableNeighbors(terrain, pos.x, pos.y);
}

/**
 * The upgrade pile's home: a walkable tile within range 3 of the controller,
 * preferring ≥3 walkable neighbors (several upgraders must fit around the pile),
 * then minimal chebyshev distance to the spawn, then deterministic (y, x) order.
 */
export function chooseUpgradeSpot(terrain: TerrainGrid, controller: Pos, spawn: Pos): Pos | undefined {
    let best: { x: number; y: number; open: boolean; dist: number } | undefined;
    for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
            if (dx === 0 && dy === 0) continue;
            const x = controller.x + dx;
            const y = controller.y + dy;
            if (!inBounds(x, y) || terrain.isWall(x, y)) continue;
            const open = walkableNeighbors(terrain, x, y) >= 3;
            const dist = Math.max(Math.abs(x - spawn.x), Math.abs(y - spawn.y));
            if (
                !best ||
                (open && !best.open) ||
                (open === best.open && dist < best.dist) ||
                (open === best.open && dist === best.dist && (y < best.y || (y === best.y && x < best.x)))
            ) {
                best = { x, y, open, dist };
            }
        }
    }
    return best ? { x: best.x, y: best.y, roomName: controller.roomName } : undefined;
}
