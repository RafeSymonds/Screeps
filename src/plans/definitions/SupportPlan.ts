import { Plan } from "./Plan";
import { updateRoomSupportState, roomCanHelp } from "rooms/RoomSupport";
import { World } from "world/World";
import { ownedRooms } from "rooms/RoomUtils";
import { createBootstrapTaskData } from "tasks/definitions/BootstrapTask";
import { planSpawnRequest, SpawnRequestPriority } from "spawner/SpawnRequests";
import { estimateSafeRouteLength } from "rooms/InterRoomRouter";

export class SupportPlan extends Plan {
    public override run(world: World): void {
        const allOwned = ownedRooms();

        for (const [, worldRoom] of world.rooms) {
            updateRoomSupportState(worldRoom.room);
        }

        // Find rooms that need bootstrapping and assign helpers
        for (const room of allOwned) {
            const onboarding = room.memory.onboarding;
            if (!onboarding) continue;
            if (onboarding.stage === "established") continue;

            const taskId = `Bootstrap-${room.name}`;
            if (world.taskManager.tasks.has(taskId)) continue;

            // Find the best helper room
            const helper = this.findBestHelper(room, allOwned);
            if (!helper) continue;

            // Create bootstrap task owned by the helper room
            world.taskManager.add(createBootstrapTaskData(room.name, helper.name));

            // Spawn workers in the helper room for this purpose
            const desiredWorkers = onboarding.stage === "settling" ? 3 : 2;

            planSpawnRequest(
                helper,
                "support",
                room.name,
                "worker",
                SpawnRequestPriority.HIGH + 20, // High priority for cross-room help
                desiredWorkers,
                30,
                400
            );
        }
    }

    private findBestHelper(targetRoom: Room, allOwned: Room[]): Room | null {
        let bestRoom: Room | null = null;
        let bestScore = -Infinity;

        for (const candidate of allOwned) {
            if (candidate.name === targetRoom.name) continue;
            if (!roomCanHelp(candidate, targetRoom.name)) continue;

            const distance = estimateSafeRouteLength(candidate.name, targetRoom.name);
            if (distance === null) continue;

            const storageEnergy = candidate.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
            const score = storageEnergy / 1000 - distance * 20;

            if (score > bestScore) {
                bestScore = score;
                bestRoom = candidate;
            }
        }

        return bestRoom;
    }
}
