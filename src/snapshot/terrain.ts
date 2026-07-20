/**
 * Immutable terrain, copied once per room into a plain grid and heap-cached
 * forever (rebuilt lazily after a global reset). See docs/design/snapshot.md.
 */
export interface TerrainGrid {
    isWall(x: number, y: number): boolean;
    isSwamp(x: number, y: number): boolean;
}

const cache = new Map<string, TerrainGrid>();

export function getTerrain(roomName: string): TerrainGrid {
    const cached = cache.get(roomName);
    if (cached) {
        return cached;
    }
    const terrain = Game.map.getRoomTerrain(roomName);
    const masks = new Uint8Array(2500);
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            masks[y * 50 + x] = terrain.get(x, y);
        }
    }
    const grid: TerrainGrid = {
        isWall: (x, y) => (masks[y * 50 + x] & TERRAIN_MASK_WALL) !== 0,
        isSwamp: (x, y) => (masks[y * 50 + x] & TERRAIN_MASK_SWAMP) !== 0
    };
    cache.set(roomName, grid);
    return grid;
}

export function _clearTerrainCacheForTest(): void {
    cache.clear();
}
