import { Plan } from "./Plan";
import { World } from "world/World";
import { ownedRooms } from "rooms/RoomUtils";
import { createClaimTaskData } from "tasks/definitions/ClaimTask";
import { SpawnRequestPriority, planSpawnRequest } from "spawner/SpawnRequests";
import { updateRoomGrowth } from "rooms/RoomGrowth";
import { roomExpansionReadiness } from "economy/EconomyLogger";

const MIN_BUCKET = 3000;
const MIN_STORAGE_ENERGY = 50000;

export class ExpansionPlan extends Plan {
    public override run(world: World): void {
        const owned = ownedRooms();
        const ownedCount = owned.length;
        const gclLevel = Game.gcl.level;

        if (ownedCount >= gclLevel) {
            return;
        }

        if (Game.cpu.bucket < MIN_BUCKET) {
            return;
        }

        const candidates = this.findExpansionCandidates(owned);

        for (const room of candidates) {
            updateRoomGrowth(room);

            if (!this.shouldExpandFromRoom(room)) {
                continue;
            }

            const growth = room.memory.growth;
            if (!growth?.expansionReady || !growth.nextClaimTarget) {
                continue;
            }

            const target = growth.nextClaimTarget;

            if (Game.rooms[target]?.controller?.my) {
                continue;
            }

            const taskId = `Claim-${target}`;

            if (world.taskManager.tasks.has(taskId)) {
                continue;
            }

            world.taskManager.add(createClaimTaskData(target, room.name));

            planSpawnRequest(room, "expansion", target, "scout", SpawnRequestPriority.NORMAL + 40, 1, 50, 650);
        }
    }

    private findExpansionCandidates(owned: Room[]): Room[] {
        return owned
            .filter(room => {
                const stats = room.memory.spawnStats;
                const readiness = roomExpansionReadiness(room, Game.cpu.bucket, stats);
                return readiness.ready;
            })
            .sort((a, b) => {
                const aPressure =
                    (a.memory.spawnStats?.mine.pressure ?? 0) +
                    (a.memory.spawnStats?.carry.pressure ?? 0) +
                    (a.memory.spawnStats?.work.pressure ?? 0);
                const bPressure =
                    (b.memory.spawnStats?.mine.pressure ?? 0) +
                    (b.memory.spawnStats?.carry.pressure ?? 0) +
                    (b.memory.spawnStats?.work.pressure ?? 0);
                return aPressure - bPressure;
            });
    }

    private shouldExpandFromRoom(room: Room): boolean {
        const storageEnergy = room.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
        if (storageEnergy < MIN_STORAGE_ENERGY) {
            return false;
        }

        const rcl = room.controller?.level ?? 0;
        if (rcl < 4) {
            return false;
        }

        const stats = room.memory.spawnStats;
        const totalPressure = (stats?.mine.pressure ?? 0) + (stats?.carry.pressure ?? 0) + (stats?.work.pressure ?? 0);

        if (totalPressure > 0.7) {
            return false;
        }

        return true;
    }
}
