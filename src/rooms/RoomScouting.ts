import { roomsWithin } from "./RoomUtils";
import { createScoutTaskData } from "tasks/definitions/ScoutTask";
import { TaskManager } from "tasks/core/TaskManager";

function needsScouting(roomName: string): boolean {
    const intel = Memory.rooms[roomName]?.intel;
    if (!intel) return true;

    const freshness = Game.time - intel.lastScouted;
    if (freshness > 5000) return true;

    // Be more aggressive if the room is dangerous (to see if it clears)
    const isDangerous = intel.keeperLairs > 0 || intel.hasEnemyBase || intel.hasInvaderCore || (intel.hostileMilitaryParts ?? 0) > 0;
    if (isDangerous && freshness > 100) return true;

    return false;
}

export function scoutFrontier(home: string, radius: number, taskManager: TaskManager) {
    for (const room of roomsWithin(home, radius)) {
        if (needsScouting(room)) {
            const taskData = createScoutTaskData(room);

            taskManager.add(taskData);
        }
    }
}
