import { WorldRoom } from "world/WorldRoom";
import { RoomEnergyState, EnergyTarget } from "./RoomEnergyState";
import { CreepState } from "creeps/CreepState";
import { TaskManager } from "tasks/core/TaskManager";

export class ResourceManager {
    private roomStates = new Map<string, RoomEnergyState>();

    constructor(worldRooms: WorldRoom[], taskManager: TaskManager) {
        // 1️⃣ Build room energy states
        for (const room of worldRooms) {
            this.roomStates.set(room.room.name, new RoomEnergyState(room));
        }

        // 2️⃣ Re-apply reservations from existing creeps
        for (const room of worldRooms) {
            const roomState = this.roomStates.get(room.room.name)!;

            for (const creep of room.myCreeps) {
                /* ----------------------------------
               Container-level reservations
               ---------------------------------- */

                const targetId = creep.memory.energyTargetId as Id<EnergyTarget> | undefined;
                if (targetId) {
                    const amt = creep.creep.store.getFreeCapacity(RESOURCE_ENERGY);
                    if (amt > 0) {
                        roomState.reserve(targetId, amt);
                    }
                }

                /* ----------------------------------
               Remote energy pool reservations
               ---------------------------------- */

                const reserved = creep.memory.remoteEnergyReserved;
                const targetRoom = creep.memory.remoteEnergyRoom;

                if (reserved && targetRoom) {
                    const roomMemory = Memory.rooms[targetRoom];
                    if (roomMemory && roomMemory.remoteMining) {
                        roomMemory.remoteMining.energyReserved += reserved;
                    }
                }
            }
        }
    }

    getRoomEnergy(roomName: string): number {
        return this.roomStates.get(roomName)?.getAvailableEnergy() ?? 0;
    }

    roomHasEnoughEnergy(creepState: CreepState, roomName: string): boolean {
        const roomState = this.roomStates.get(roomName);
        if (!roomState) return false;

        const remoteReserved = Memory.rooms[roomName]?.remoteMining?.energyReserved ?? 0;
        const available = roomState.getAvailableEnergy() - remoteReserved;

        const creepCapacity = creepState.creep.store.getFreeCapacity(RESOURCE_ENERGY);

        return available >= creepCapacity * 0.5;
    }

    findEnergyAndReserve(creep: Creep, destination: Structure | RoomPosition | null): EnergyTarget | null {
        return this.roomStates.get(creep.room.name)?.findBestSource(creep, destination) ?? null;
    }
}
