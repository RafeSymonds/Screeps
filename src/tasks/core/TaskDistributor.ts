import { AnyTask } from "tasks/definitions/Task";
import { TaskKind } from "./TaskKind";

export function roomCanConsiderTask(room: Room, task: AnyTask): boolean {
    return true;

    // TODO: update to work properly
    //
    // if (room.name == task.data.targetRoom) {
    //     return true;
    // }
    //
    // const distance = Game.map.getRoomLinearDistance(room.name, this.data.targetRoom);
    // if (distance <= room.memory.assistRadius) {
    //     return true;
    // }
    //
    // return false;
}
