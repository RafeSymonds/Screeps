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
        for (const worldRoom of worldRooms) {
            for (const cs of worldRoom.myCreeps) {
                const creep = cs.creep;
                const currentRoomState = this.roomStates.get(creep.room.name);

                if (!currentRoomState) continue;

                /* -------- Target-level pickup reservations -------- */
                const targetId = cs.memory.energyTargetId;
                if (targetId) {
                    const amt = creep.store.getFreeCapacity(RESOURCE_ENERGY);
                    if (amt > 0) {
                        currentRoomState.reserveTarget(targetId, creep, amt);
                    }
                }

                /* -------- Remote intent reservations -------- */
                const reserved = cs.memory.remoteEnergyReserved;
                const targetRoom = cs.memory.remoteEnergyRoom;

                if (!reserved || !targetRoom) continue;

                // Remote reservations are always in the target room
                const targetRoomState = this.roomStates.get(targetRoom);
                if (targetRoomState) {
                    targetRoomState.reserveRemoteEnergy(reserved);
                }
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

        // If the creep already has a significant amount of energy, we consider it "enough"
        // to start a delivery run, especially for haulers.
        if (creepState.creep.store.getUsedCapacity(RESOURCE_ENERGY) >= 50) {
            return true;
        }

        // Dedicated haulers should pick up anything if they are idle
        if (creepState.creep.body.some(p => p.type === CARRY) && !creepState.creep.body.some(p => p.type === WORK)) {
            return available > 0;
        }

        return available >= needed * 0.5;
    }

    findEnergyAndReserve(creep: Creep, destination: Structure | RoomPosition | null): EnergyTarget | null {
        return this.roomStates.get(creep.room.name)?.findBestSource(creep, destination) ?? null;
    }

    reserveRemoteEnergy(room: string, amount: number): void {
        this.roomStates.get(room)?.reserveRemoteEnergy(amount);
    }
}
