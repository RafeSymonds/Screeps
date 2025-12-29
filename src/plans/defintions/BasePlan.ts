import { Plan } from "./Plan";
import { World } from "world/World";
import { runRelativeBasePlanner } from "basePlaner/BasePlans";

export class BasePlan extends Plan {
    public override run(world: World): void {
        for (const [, room] of world.rooms) {
            runRelativeBasePlanner(room.room);
        }
    }
}
