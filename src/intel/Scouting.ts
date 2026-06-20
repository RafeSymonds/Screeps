import { RoomIntel, SourceIntel } from "intel/types";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";

/**
 * Record an enriched intel snapshot for one (visible) room. Reused by the passive
 * sweep (`updateIntel`) and by a scout the moment it gains vision, so freshly
 * explored rooms are usable for remote selection without waiting for the next
 * throttled sweep. The extra hostile-structure finds run only here (during
 * throttled scouting), not in the per-tick WorldRoom build.
 */
export function recordRoomIntel(worldRoom: WorldRoom): void {
    const room = worldRoom.room;
    const controller = worldRoom.controller;
    const sources: SourceIntel[] = worldRoom.sources.map(source => ({
        id: source.id,
        x: source.pos.x,
        y: source.pos.y
    }));

    const hostileStructures = room.find(FIND_HOSTILE_STRUCTURES);
    const invaderCore = hostileStructures.some(structure => structure.structureType === STRUCTURE_INVADER_CORE);
    const sourceKeeper = room.find(FIND_STRUCTURES).some(structure => structure.structureType === STRUCTURE_KEEPER_LAIR);

    const intel: RoomIntel = {
        lastSeen: Game.time,
        sources,
        controllerId: controller?.id,
        controllerLevel: controller?.level,
        owner: controller?.owner?.username,
        reservation: controller?.reservation
            ? { username: controller.reservation.username, ticks: controller.reservation.ticksToEnd }
            : undefined,
        hostiles: worldRoom.hostiles.length,
        invaderCore: invaderCore || undefined,
        sourceKeeper: sourceKeeper || undefined
    };

    const roomMemory = Memory.rooms[worldRoom.name] ?? (Memory.rooms[worldRoom.name] = {});
    roomMemory.intel = intel;
}

/**
 * Passive scouting: record intel for every room we currently have vision of.
 * Active exploration (gaining vision of non-adjacent or unseen neighbors) is done
 * by scout creeps the empire layer requests; this sweep captures whatever they —
 * and the rest of the workforce — can already see.
 */
export function updateIntel(world: World): void {
    for (const [, worldRoom] of world.rooms) {
        recordRoomIntel(worldRoom);
    }
}
