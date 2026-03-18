import { Plan } from "./Plan";
import { World } from "world/World";
import { ownedRooms } from "rooms/RoomUtils";
import { createClaimTaskData } from "tasks/definitions/ClaimTask";
import { SpawnRequestPriority, planSpawnRequest } from "spawner/SpawnRequests";

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

            if (!growth || !growth.expansionReady || !growth.nextClaimTarget) {
                continue;
            }

            // Safety check: ensure we actually have enough storage energy to support expansion
            const storageEnergy = room.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
            if (storageEnergy < 50000) {
                continue;
            }

            const target = growth.nextClaimTarget;

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

            planSpawnRequest(
                room,
                "expansion",
                target,
                "scout", // reuse scout slot for claimer (CLAIM + MOVE body)
                SpawnRequestPriority.NORMAL + 40,
                1,
                50,
                650
            );
        }
    }
}
