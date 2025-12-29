import { World } from "world/World";
import { Plan } from "./Plan";
import { scoutFrontier } from "rooms/RoomScouting";

export class ScoutingPlan extends Plan {
    public override run(world: World) {
        const taskManager = world.taskManager;

        for (const [, room] of world.rooms) {
            scoutFrontier(room.room.name, 1, taskManager);
        }
    }
}
