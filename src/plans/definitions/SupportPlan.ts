import { Plan } from "./Plan";
import { roomCanHelp, updateRoomSupportState } from "rooms/RoomSupport";
import { World } from "world/World";
import { ownedRooms } from "rooms/RoomUtils";
import { createBootstrapTaskData } from "tasks/definitions/BootstrapTask";
import { SpawnRequestPriority, planSpawnRequest } from "spawner/SpawnRequests";
import { estimateSafeRouteLength } from "rooms/InterRoomRouter";

const MAX_SUPPORT_REQUESTS_PER_TICK = 2;
const HELPER_MIN_STORAGE = 10000;
const HELPER_MIN_RCL = 4;

export class SupportPlan extends Plan {
    public override run(world: World): void {
        const allOwned = ownedRooms();

        for (const [, worldRoom] of world.rooms) {
            updateRoomSupportState(worldRoom.room);
        }

        const activeHelpers = new Map<string, number>();
        let supportRequestsThisTick = 0;

        const sortedRooms = [...allOwned].sort((a, b) => {
            const aStage = a.memory.onboarding?.stage ?? "established";
            const bStage = b.memory.onboarding?.stage ?? "established";
            const stageOrder = { settling: 0, bootstrapping: 1, established: 2 };
            return stageOrder[aStage] - stageOrder[bStage];
        });

        for (const room of sortedRooms) {
            if (supportRequestsThisTick >= MAX_SUPPORT_REQUESTS_PER_TICK) break;

            const onboarding = room.memory.onboarding;
            if (!onboarding) continue;
            if (onboarding.stage === "established") continue;

            const taskId = `Bootstrap-${room.name}`;
            if (world.taskManager.tasks.has(taskId)) continue;

            const helper = this.findBestHelper(room, allOwned, activeHelpers);
            if (!helper) continue;

            activeHelpers.set(helper.name, (activeHelpers.get(helper.name) ?? 0) + 1);
            supportRequestsThisTick++;

            world.taskManager.add(createBootstrapTaskData(room.name, helper.name));

            const desiredWorkers = onboarding.stage === "settling" ? 3 : 2;

            planSpawnRequest(
                helper,
                "support",
                room.name,
                "worker",
                SpawnRequestPriority.HIGH + 20,
                desiredWorkers,
                30,
                400
            );
        }
    }

    private findBestHelper(targetRoom: Room, allOwned: Room[], activeHelpers: Map<string, number>): Room | null {
        let bestRoom: Room | null = null;
        let bestScore = -Infinity;

        for (const candidate of allOwned) {
            if (candidate.name === targetRoom.name) continue;
            if (!roomCanHelp(candidate, targetRoom.name)) continue;

            const rcl = candidate.controller?.level ?? 0;
            if (rcl < HELPER_MIN_RCL) continue;

            const storageEnergy = candidate.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
            if (storageEnergy < HELPER_MIN_STORAGE) continue;

            const activeCount = activeHelpers.get(candidate.name) ?? 0;
            if (activeCount >= 2) continue;

            const distance = estimateSafeRouteLength(candidate.name, targetRoom.name);
            if (distance === null) continue;

            const spawns = candidate.find(FIND_MY_SPAWNS).length;
            const pressurePenalty =
                (candidate.memory.spawnStats?.mine.pressure ?? 0) + (candidate.memory.spawnStats?.carry.pressure ?? 0);

            const score = storageEnergy / 10000 + pressurePenalty * 2 - distance * 0.5 - activeCount;

            if (score > bestScore) {
                bestScore = score;
                bestRoom = candidate;
            }
        }

        return bestRoom;
    }
}
