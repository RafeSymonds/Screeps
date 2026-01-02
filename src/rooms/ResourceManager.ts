import { WorldRoom } from "world/WorldRoom";
import { RoomEnergyState, EnergyTarget } from "./RoomEnergyState";
import { CreepState } from "creeps/CreepState";

export class ResourceManager {
    private roomStates = new Map<string, RoomEnergyState>();

    constructor(worldRooms: WorldRoom[]) {
        for (const room of worldRooms) {
            this.roomStates.set(room.room.name, new RoomEnergyState(room));

            // apply creep reservations
            for (const creep of room.myCreeps) {
                const id = creep.memory.energyTargetId;
                if (!id) continue;

                const amt = creep.creep.store.getFreeCapacity(RESOURCE_ENERGY);
                if (amt > 0) {
                    this.roomStates.get(room.room.name)!.reserve(id, amt);
                }
            }

            // console.log(`[RESOURCE MANAGER] Room ${room.room.name} has ${this.getRoomEnergy(room.room.name)}`);
        }
    }

    getRoomEnergy(roomName: string): number {
        return this.roomStates.get(roomName)?.getAvailableEnergy() ?? 0;
    }

    roomHasEnoughEnergy(creepState: CreepState, roomName: string): boolean {
        const roomEnergy = this.getRoomEnergy(roomName);

        const creepCapacity = creepState.creep.store.getFreeCapacity(RESOURCE_ENERGY);

        // Require at least half a load
        return roomEnergy >= creepCapacity * 0.5;
    }

    findEnergy(creep: Creep, destination: Structure | RoomPosition | null): EnergyTarget | null {
        return this.roomStates.get(creep.room.name)?.findBestSource(creep, destination) ?? null;
    }
}
