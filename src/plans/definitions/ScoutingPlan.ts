import { World } from "world/World";
import { Plan } from "./Plan";
import { scoutFrontier } from "rooms/RoomScouting";

export class ScoutingPlan extends Plan {
    public override run(world: World) {
        const taskManager = world.taskManager;

        for (const [, room] of world.rooms) {
            // Don't scout until we have miners and haulers running
            const stats = room.room.memory.spawnStats;
            if (!stats || (stats.mine.supplyCreeps === 0 && stats.carry.supplyCreeps === 0)) continue;

            const growth = room.room.memory.growth;
            let radius = Math.max(room.room.memory.remoteRadius || 1, 2);

            // Increase scouting radius if we are looking for expansion targets
            if (growth?.stage === "surplus") {
                radius += 2;
            } else if (growth?.stage === "remote") {
                radius += 1;
            }

            scoutFrontier(room.room.name, radius, taskManager);

            // Also scout around any identified claim target
            if (growth?.nextClaimTarget) {
                scoutFrontier(growth.nextClaimTarget, 1, taskManager);
            }
        }
    }
}
