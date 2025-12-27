import { World } from "world/World";

export function performCreepActions(world: World) {
    for (const [, room] of world.rooms) {
        for (const creep of room.myCreeps) {
            creep.perform(world.taskManager);
        }
    }
}
