import { World } from "world/World";
import { Plan } from "./Plan";
import { scoutFrontier } from "rooms/RoomScouting";

export class ScoutingPlan extends Plan {
    public override run(world: World) {
        const taskManager = world.taskManager;

        for (const [, room] of world.rooms) {
            const radius = Math.max(1, room.room.memory.remoteRadius + (room.room.memory.growth?.nextClaimTarget ? 1 : 0));
            scoutFrontier(room.room.name, radius, taskManager);
        }
    }
}
