import { RoomIntel } from "intel/types";
import { World } from "world/World";

/**
 * Passive scouting: record intel for every room we currently have vision of.
 * Active map exploration with dedicated scout creeps is a future expansion.
 */
export function updateIntel(world: World): void {
    for (const [name, worldRoom] of world.rooms) {
        const roomMemory = Memory.rooms[name] ?? (Memory.rooms[name] = {});
        const intel: RoomIntel = {
            lastSeen: Game.time,
            sources: worldRoom.sources.length,
            controllerLevel: worldRoom.controller?.level,
            owner: worldRoom.controller?.owner?.username,
            hostiles: worldRoom.hostiles.length
        };
        roomMemory.intel = intel;
    }
}
