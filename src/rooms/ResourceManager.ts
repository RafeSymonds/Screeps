import { WorldRoom } from "world/WorldRoom";
import { EnergyTarget, RoomEnergyState } from "./RoomEnergyState";
import { CreepState } from "creeps/CreepState";
import { TaskManager } from "tasks/core/TaskManager";

export class ResourceManager {
    private roomStates = new Map<string, RoomEnergyState>();

    constructor(worldRooms: WorldRoom[], taskManager: TaskManager) {
        /* ================================
           1️⃣ Build room energy states
           ================================ */
        for (const room of worldRooms) {
            this.roomStates.set(room.room.name, new RoomEnergyState(room));
        }

        /* ================================
           3️⃣ Rebuild from living creeps
           ================================ */
        for (const room of worldRooms) {
            const roomState = this.roomStates.get(room.room.name)!;

            for (const cs of room.myCreeps) {
                const creep = cs.creep;

                /* -------- Target-level pickup reservations -------- */
                const targetId = cs.memory.energyTargetId;
                if (targetId) {
                    const amt = creep.store.getFreeCapacity(RESOURCE_ENERGY);
                    if (amt > 0) {
                        roomState.reserveTarget(targetId, creep, amt);
                    }
                }

                /* -------- Remote intent reservations -------- */
                const reserved = cs.memory.remoteEnergyReserved;
                const targetRoom = cs.memory.remoteEnergyRoom;

                if (!reserved || !targetRoom) continue;

                const targetMem = Memory.rooms[targetRoom];
                if (!targetMem?.remoteMining) continue;

                roomState.reserveRemoteEnergy(reserved);
            }
        }
    }

    /* ================================
       Queries
       ================================ */

    getRoomEnergy(roomName: string): number {
        return this.roomStates.get(roomName)?.getAvailableEnergy() ?? 0;
    }

    roomHasEnoughEnergy(creepState: CreepState, roomName: string): boolean {
        const roomState = this.roomStates.get(roomName);
        if (!roomState) return false;

        const available = roomState.getAvailableEnergy();

        const needed = creepState.creep.store.getCapacity(RESOURCE_ENERGY);

        return available >= needed * 0.5;
    }

    findEnergyAndReserve(creep: Creep, destination: Structure | RoomPosition | null): EnergyTarget | null {
        return this.roomStates.get(creep.room.name)?.findBestSource(creep, destination) ?? null;
    }

    reserveRemoteEnergy(room: string, amount: number): void {
        this.roomStates.get(room)?.reserveRemoteEnergy(amount);
    }
}
