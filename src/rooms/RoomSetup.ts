import { createBuildTaskData } from "tasks/BuildTask";
import { createHarvestTaskData } from "tasks/HarvestTask";
import { TaskManager } from "tasks/TaskManager";
import { createtransferTaskData as createTransferTaskData } from "tasks/TransferTask";

export function setupRoomMemory(room: Room, taskManager: TaskManager) {
    const sources = room.find(FIND_SOURCES);

    sources.forEach(source => {
        const taskData = createHarvestTaskData(source);

        taskManager.add(taskData);
    });

    const spawners = room.find(FIND_MY_SPAWNS);

    spawners.forEach(spawn => {
        const taskData = createTransferTaskData(spawn);

        taskManager.add(taskData);
    });

    const constructionSites = room.find(FIND_CONSTRUCTION_SITES);

    constructionSites.forEach(constructionSite => {
        const taskData = createBuildTaskData(constructionSite);

        taskManager.add(taskData);
    });
}
