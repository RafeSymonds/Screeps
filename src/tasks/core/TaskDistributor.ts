import { estimateSafeRouteLength } from "rooms/InterRoomRouter";
import { AnyTask } from "tasks/definitions/Task";
import { TaskKind } from "./TaskKind";

export function roomCanConsiderTask(room: Room, task: AnyTask): boolean {
    if (TaskKind.isRemote(task.type())) {
        return room.name === task.ownerRoom();
    }

    if (room.name == task.data.targetRoom) {
        return true;
    }

    const distance = estimateSafeRouteLength(room.name, task.data.targetRoom);

    if (distance === null) {
        return false;
    }

    return distance <= room.memory.assistRadius;
}
