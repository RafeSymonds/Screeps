import { createHarvestTaskData } from "tasks/HarvestTask";
import { TaskManager } from "tasks/TaskManager";

export function setupRoomMemory(room: Room, taskManager: TaskManager) {
    const sources = room.find(FIND_SOURCES);

    const taskIds: string[] = [];

    sources.forEach(source => {
        const taskData = createHarvestTaskData(source);

        taskIds.push(taskData.id);

        taskManager.add(taskData);
    });
}
