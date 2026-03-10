import { Plan } from "./Plan";
import { updateRoomSupportState } from "rooms/RoomSupport";
import { World } from "world/World";

export class SupportPlan extends Plan {
    public override run(world: World): void {
        for (const [, worldRoom] of world.rooms) {
            updateRoomSupportState(worldRoom.room);
        }
    }
}
