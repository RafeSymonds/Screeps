import { Offset, RCL_LIMITS, STRUCTURE_RCL, PlannedStructure, RELATIVE_BUNKER } from "./BaseLimitInfo";

/* =========================================
   ENTRY POINT
   ========================================= */

export function runRelativeBasePlanner(room: Room): void {
    const controller = room.controller;
    if (!controller) return;

    const anchor = getAnchorSpawn(room);
    if (!anchor) return;

    const rcl = controller.level;

    for (const structure of Object.keys(RELATIVE_BUNKER.buildings) as PlannedStructure[]) {
        if (rcl < STRUCTURE_RCL[structure]) continue;

        const offsets = RELATIVE_BUNKER.buildings[structure];
        const limit = RCL_LIMITS[structure]?.[rcl - 1] ?? offsets.length;

        for (let i = 0; i < Math.min(limit, offsets.length); i++) {
            placeRelative(room, structure, anchor.pos, offsets[i], rcl);
        }
    }
}

/* =========================================
   PLACEMENT LOGIC
   ========================================= */

function placeRelative(
    room: Room,
    structure: PlannedStructure,
    anchor: RoomPosition,
    offset: Offset,
    rcl: number
): void {
    const x = anchor.x + offset.x;
    const y = anchor.y + offset.y;

    // Prevent invalid room positions
    if (x <= 1 || x >= 48 || y <= 1 || y >= 48) return;

    const pos = new RoomPosition(x, y, room.name);

    if (pos.lookFor(LOOK_STRUCTURES).some(s => s.structureType === structure)) return;
    if (pos.lookFor(LOOK_CONSTRUCTION_SITES).some(s => s.structureType === structure)) return;

    // Lazy rampart placement early game
    if (structure === "rampart" && rcl < 5 && !isCoreRampart(offset)) return;

    room.createConstructionSite(pos, structure);
}

/* =========================================
   HELPERS
   ========================================= */

function getAnchorSpawn(room: Room): StructureSpawn | null {
    if (!room.memory.anchorSpawnId) {
        const spawns = room.find(FIND_MY_SPAWNS);
        if (spawns.length === 0) return null;

        room.memory.anchorSpawnId = spawns[0].id;
    }

    return Game.getObjectById(room.memory.anchorSpawnId) ?? null;
}

function isCoreRampart(offset: Offset): boolean {
    // Protect spawn + immediate core early
    return offset.x === 0 && offset.y === 0;
}
