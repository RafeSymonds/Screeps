import { Plan } from "./Plan";
import { World } from "world/World";
import { ownedRooms } from "rooms/RoomUtils";
import { createClaimTaskData } from "tasks/definitions/ClaimTask";
import { upsertSpawnRequest } from "spawner/SpawnRequests";

const MIN_STORAGE_ENERGY = 50000;
const MIN_EXPANSION_SCORE = 120;
const MIN_BUCKET = 5000;

export class ExpansionPlan extends Plan {
    public override run(world: World): void {
        const owned = ownedRooms();
        const ownedCount = owned.length;
        const gclLevel = Game.gcl.level;

        // Can't expand beyond GCL
        if (ownedCount >= gclLevel) {
            return;
        }

        // Don't expand with low CPU bucket
        if (Game.cpu.bucket < MIN_BUCKET) {
            return;
        }

        for (const room of owned) {
            const growth = room.memory.growth;

            if (!growth || growth.stage !== "surplus") {
                continue;
            }

            if (growth.expansionScore < MIN_EXPANSION_SCORE) {
                continue;
            }

            const storageEnergy = room.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;

            if (storageEnergy < MIN_STORAGE_ENERGY) {
                continue;
            }

            const target = growth.nextClaimTarget;

            if (!target) {
                continue;
            }

            // Don't claim rooms we already own
            if (Game.rooms[target]?.controller?.my) {
                continue;
            }

            // Check if there's already an active claim task for this target
            const taskId = `Claim-${target}`;

            if (world.taskManager.tasks.has(taskId)) {
                continue;
            }

            // Create claim task and spawn request
            world.taskManager.add(createClaimTaskData(target, room.name));

            upsertSpawnRequest(room, {
                role: "scout", // reuse scout slot for claimer (CLAIM + MOVE body)
                priority: 130,
                desiredCreeps: 1,
                expiresAt: Game.time + 50,
                requestedBy: `expansion:${target}`,
                minEnergy: 650
            });
        }
    }
}
