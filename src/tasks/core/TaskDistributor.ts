import { AnyTask } from "tasks/definitions/Task";
import { TaskKind } from "./TaskKind";

export function roomCanConsiderTask(room: Room, task: AnyTask): boolean {
    // TODO: update to work properly
    //
    if (room.name == task.data.targetRoom) {
        return true;
    }

    const distance = Game.map.getRoomLinearDistance(room.name, task.data.targetRoom);

    if (TaskKind.isRemote(task.type())) {
        return distance <= room.memory.remoteRadius;
    }

    if (distance <= room.memory.assistRadius) {
        return true;
    }

    return false;
}
