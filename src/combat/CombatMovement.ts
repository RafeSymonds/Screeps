import { moveTo } from "creeps/CreepController";
import { CreepState } from "creeps/CreepState";

const DIRECTIONS: DirectionConstant[] = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];
const DIRECTION_OFFSETS: Record<DirectionConstant, [number, number]> = {
    [TOP]: [0, -1],
    [TOP_RIGHT]: [1, -1],
    [RIGHT]: [1, 0],
    [BOTTOM_RIGHT]: [1, 1],
    [BOTTOM]: [0, 1],
    [BOTTOM_LEFT]: [-1, 1],
    [LEFT]: [-1, 0],
    [TOP_LEFT]: [-1, -1]
};
const PASSABLE_STRUCTURES = new Set<StructureConstant>([STRUCTURE_CONTAINER, STRUCTURE_ROAD, STRUCTURE_RAMPART]);

function isPassable(pos: RoomPosition): boolean {
    if (pos.x <= 0 || pos.x >= 49 || pos.y <= 0 || pos.y >= 49) {
        return false;
    }

    const terrain = Game.map.getRoomTerrain(pos.roomName).get(pos.x, pos.y);
    if (terrain === TERRAIN_MASK_WALL) {
        return false;
    }

    const structures = pos.lookFor(LOOK_STRUCTURES);
    if (
        structures.some(structure => {
            if (structure.structureType === STRUCTURE_RAMPART) {
                const rampart = structure as StructureRampart;
                return !rampart.my && !rampart.isPublic;
            }

            return !PASSABLE_STRUCTURES.has(structure.structureType);
        })
    ) {
        return false;
    }

    return pos.lookFor(LOOK_CREEPS).length === 0;
}

export function moveAwayFromThreats(
    creepState: CreepState,
    threats: { pos: RoomPosition }[],
    fallback?: RoomPosition
): boolean {
    const origin = creepState.creep.pos;
    let bestDirection: DirectionConstant | null = null;
    let bestScore = -Infinity;

    for (const direction of DIRECTIONS) {
        const [dx, dy] = DIRECTION_OFFSETS[direction];
        const nextPos = new RoomPosition(origin.x + dx, origin.y + dy, origin.roomName);

        if (!isPassable(nextPos)) {
            continue;
        }

        const threatRange = threats.reduce((lowest, threat) => Math.min(lowest, nextPos.getRangeTo(threat.pos)), 50);
        const fallbackRange = fallback ? nextPos.getRangeTo(fallback) : 0;
        const score = threatRange * 20 - fallbackRange;

        if (score > bestScore) {
            bestScore = score;
            bestDirection = direction;
        }
    }

    if (bestDirection !== null) {
        creepState.creep.move(bestDirection);
        creepState.moved = true;
        return true;
    }

    if (fallback) {
        moveTo(creepState, fallback);
        return true;
    }

    return false;
}

export function safeAnchorPosition(roomName: string): RoomPosition {
    const anchor = Memory.rooms[roomName]?.defense?.safeAnchor;
    if (anchor) {
        return new RoomPosition(anchor.x, anchor.y, anchor.roomName);
    }

    return new RoomPosition(25, 25, roomName);
}
