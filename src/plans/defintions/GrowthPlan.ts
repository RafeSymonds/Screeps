import { Plan } from "./Plan";
import { updateRoomGrowth } from "rooms/RoomGrowth";
import { World } from "world/World";

export class GrowthPlan extends Plan {
    public override run(world: World): void {
        for (const [, worldRoom] of world.rooms) {
            const room = worldRoom.room;

            if (!room.controller?.my) {
                continue;
            }

            updateRoomGrowth(room);
        }
    }
}
