import { World } from "world/World";
import { Plan } from "./Plan";
import { scoutFrontier } from "rooms/RoomScouting";

export class ScoutingPlan extends Plan {
    public override run(world: World) {
        const taskManager = world.taskManager;

        for (const [, room] of world.rooms) {
            // Scout once we have basic miners running OR we are at RCL 2+
            const stats = room.room.memory.spawnStats;
            const rcl = room.room.controller?.level || 0;

            if (!stats) continue;
            
            const hasBasicEconomy = stats.mine.supplyCreeps > 0 || stats.carry.supplyCreeps > 0;
            if (!hasBasicEconomy && rcl < 2) continue;

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

            // Prioritize scouting specifically identified expansion candidates
            if (growth?.nextScoutTarget) {
                scoutFrontier(growth.nextScoutTarget, 0, taskManager); // radius 0 means just the room itself
            }
        }
    }
}
