import { Plan } from "./Plan";
import { World } from "world/World";
import { ownedRooms } from "rooms/RoomUtils";
import { createClaimTaskData } from "tasks/definitions/ClaimTask";
import { SpawnRequestPriority, planSpawnRequest } from "spawner/SpawnRequests";
import { updateRoomGrowth } from "rooms/RoomGrowth";

const MIN_BUCKET = 5000;

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

        for (const room of owned) {
            updateRoomGrowth(room);

            const growth = room.memory.growth;

            if (!growth || !growth.expansionReady || !growth.nextClaimTarget) {
                continue;
            }

            const storageEnergy = room.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
            if (storageEnergy < 50000) {
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
}
