import { getRoomCostMatrix } from "pathing/CostMatrixFactory";

const MAX_ROAD_SITES_PER_RUN = 5;

export function planRoads(room: Room, anchorX: number, anchorY: number): void {
    const rcl = room.controller?.level ?? 0;
    if (rcl < 3) return;

    const storageOffset = { x: 0, y: 6 }; // from RELATIVE_BUNKER
    const storagePos = new RoomPosition(anchorX + storageOffset.x, anchorY + storageOffset.y, room.name);

    const targets: RoomPosition[] = [];

    // Roads to sources
    for (const source of room.find(FIND_SOURCES)) {
        targets.push(source.pos);
    }

    // Road to controller
    if (room.controller) {
        targets.push(room.controller.pos);
    }

    // Road to mineral (RCL 6+)
    if (rcl >= 6) {
        const mineral = room.find(FIND_MINERALS)[0];
        if (mineral) {
            targets.push(mineral.pos);
        }
    }

    let placed = 0;
    for (const target of targets) {
        if (placed >= MAX_ROAD_SITES_PER_RUN) break;

        const result = PathFinder.search(
            storagePos,
            { pos: target, range: 1 },
            {
                plainCost: 2,
                swampCost: 3,
                maxOps: 1000,
                roomCallback: getRoomCostMatrix
            }
        );

        if (result.incomplete) continue;

        for (const pos of result.path) {
            if (placed >= MAX_ROAD_SITES_PER_RUN) break;

            const hasRoad = pos.lookFor(LOOK_STRUCTURES).some(s => s.structureType === STRUCTURE_ROAD);
            const hasSite = pos.lookFor(LOOK_CONSTRUCTION_SITES).some(s => s.structureType === STRUCTURE_ROAD);

            if (!hasRoad && !hasSite) {
                const result = room.createConstructionSite(pos, STRUCTURE_ROAD);
                if (result === OK) placed++;
            }
        }
    }
}
