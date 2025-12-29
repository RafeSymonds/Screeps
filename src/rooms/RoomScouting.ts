import { roomsWithin } from "./RoomUtils";
import { createScoutTaskData } from "tasks/definitions/ScoutTask";
import { TaskManager } from "tasks/core/TaskManager";

function needsScouting(roomName: string): boolean {
    const intel = Memory.rooms[roomName]?.intel;

    return !intel || Game.time - intel.lastScouted > 5000;
}

export function scoutFrontier(home: string, radius: number, taskManager: TaskManager) {
    for (const room of roomsWithin(home, radius)) {
        console.log("scouting", needsScouting(room));
        if (needsScouting(room)) {
            const taskData = createScoutTaskData(room);

            taskManager.add(taskData);
        }
    }
}
