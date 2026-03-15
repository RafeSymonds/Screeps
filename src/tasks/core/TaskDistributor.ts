import { estimateSafeRouteLength } from "rooms/InterRoomRouter";
import { activeSupportRequest, roomCanHelp } from "rooms/RoomSupport";
import { AnyTask } from "tasks/definitions/Task";
import { TaskKind } from "./TaskKind";

export function roomCanConsiderTask(room: Room, task: AnyTask): boolean {
    if (TaskKind.isRemote(task.type())) {
        return room.name === task.ownerRoom();
    }

    // Bootstrap tasks: only the designated helper room
    if (task.type() === TaskKind.BOOTSTRAP) {
        return room.name === task.ownerRoom();
    }

    if (room.name == task.data.targetRoom) {
        return true;
    }

    const distance = estimateSafeRouteLength(room.name, task.data.targetRoom);

    if (distance === null) {
        return false;
    }

    if (activeSupportRequest(task.data.targetRoom) && roomCanHelp(room, task.data.targetRoom)) {
        return true;
    }

    return distance <= room.memory.assistRadius;
}
