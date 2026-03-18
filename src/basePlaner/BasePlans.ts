import { Offset, PlannedStructure, RCL_LIMITS, RELATIVE_BUNKER, STRUCTURE_RCL } from "./BaseLimitInfo";
import { selectAnchor } from "./AnchorSelection";
import { planRoads } from "./RoadPlanner";

/* =========================================
   ENTRY POINT
   ========================================= */

export function runRelativeBasePlanner(room: Room): void {
    const controller = room.controller;
    if (!controller || !controller.my) return;

    const basePlan = selectAnchor(room);
    const anchorPos = new RoomPosition(basePlan.anchorX, basePlan.anchorY, room.name);
    const rcl = controller.level;

    for (const structure of Object.keys(RELATIVE_BUNKER.buildings) as PlannedStructure[]) {
        if (rcl < STRUCTURE_RCL[structure]) continue;

        const offsets = RELATIVE_BUNKER.buildings[structure];
        const limit = RCL_LIMITS[structure]?.[rcl - 1] ?? offsets.length;

        for (let i = 0; i < Math.min(limit, offsets.length); i++) {
            placeRelative(room, structure, anchorPos, offsets[i], rcl);
        }
    }

    // Plan roads from storage to sources/controller
    if (rcl >= 3) {
        planRoads(room, basePlan.anchorX, basePlan.anchorY);
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

    // Lazy road placement
    if (structure === "road" && !roadAllowed(offset, rcl)) return;

    room.createConstructionSite(pos, structure);
}

/* =========================================
   HELPERS
   ========================================= */

function isCoreRampart(offset: Offset): boolean {
    // Protect spawn + immediate core early
    return offset.x === 0 && offset.y === 0;
}

function roadAllowed(offset: Offset, rcl: number): boolean {
    // Core cross only
    if (rcl <= 3) {
        return (offset.x === 0 && Math.abs(offset.y) <= 2) || (offset.y === 0 && Math.abs(offset.x) <= 2);
    }

    // Internal bunker circulation
    if (rcl <= 5) {
        return Math.abs(offset.x) <= 4 && Math.abs(offset.y) <= 4;
    }

    // Full road network
    return true;
}
