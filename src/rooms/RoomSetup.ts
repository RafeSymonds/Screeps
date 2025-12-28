import { createBuildTaskData } from "tasks/BuildTask";
import { createHarvestTaskData } from "tasks/HarvestTask";
import { TaskManager } from "tasks/TaskManager";
import { createtransferTaskData as createTransferTaskData } from "tasks/TransferTask";
import { createUpgradeTaskData } from "tasks/UpgradeTask";

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

    const extensions = room
        .find(FIND_MY_STRUCTURES)
        .filter((s): s is StructureExtension => s.structureType === STRUCTURE_EXTENSION);
    console.log("extensions", extensions.length);
    extensions.forEach(extension => {
        const taskData = createTransferTaskData(extension);
        taskManager.add(taskData);
    });

    const constructionSites = room.find(FIND_CONSTRUCTION_SITES);

    constructionSites.forEach(constructionSite => {
        const taskData = createBuildTaskData(constructionSite);
        taskManager.add(taskData);
    });

    if (room.controller) {
        const taskData = createUpgradeTaskData(room.controller);
        taskManager.add(taskData);
    }
}
