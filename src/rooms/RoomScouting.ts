import { roomsWithin } from "./RoomUtils";
import { createScoutTaskData } from "tasks/definitions/ScoutTask";
import { TaskManager } from "tasks/core/TaskManager";

function needsScouting(roomName: string): boolean {
    const intel = Memory.rooms[roomName]?.intel;
    if (!intel) return true;

    const freshness = Game.time - intel.lastScouted;
    if (freshness > 5000) return true;

    // Be more aggressive if the room is dangerous (to see if it clears)
    // But don't aggressively rescout keeper rooms as they are permanently dangerous
    const hasTemporaryHazard = intel.hasEnemyBase || intel.hasInvaderCore || (intel.hostileMilitaryParts ?? 0) > 0;
    if (hasTemporaryHazard && freshness > 500) return true;

    return false;
}

export function scoutFrontier(home: string, radius: number, taskManager: TaskManager) {
    const targets = roomsWithin(home, radius);
    targets.add(home);

    for (const room of targets) {
        if (needsScouting(room)) {
            const intel = Memory.rooms[room]?.intel;
            let priority = 1;

            // Distance 2 is prioritized for remotes
            const distance = Game.map.getRoomLinearDistance(home, room);
            if (distance <= 2) {
                priority *= 2;
            }

            // High potential rooms are prioritized
            if (intel && (intel.sourceCount ?? 0) >= 2) {
                priority *= 3;
            }

            // If we've never scouted it, it's high priority
            if (!intel) {
                priority *= 5;
            }

            const taskData = createScoutTaskData(room, priority);

            taskManager.add(taskData);
        }
    }
}
