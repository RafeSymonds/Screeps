import { createHarvestTaskData } from "tasks/HarvestTask";
import { TaskManager } from "tasks/TaskManager";
import { createtransferTaskData } from "tasks/TransferTask";

export function setupRoomMemory(room: Room, taskManager: TaskManager) {
    const sources = room.find(FIND_SOURCES);

    sources.forEach(source => {
        const taskData = createHarvestTaskData(source);

        taskManager.add(taskData);
    });

    const spawners = room.find(FIND_MY_SPAWNS);

    spawners.forEach(spawn => {
        const taskData = createtransferTaskData(spawn);

        taskManager.add(taskData);
    });
}
