import { createBuildTaskData } from "tasks/definitions/BuildTask";
import { createHarvestTaskData } from "tasks/definitions/HarvestTask";
import { TaskManager } from "tasks/core/TaskManager";
import { createtransferTaskData as createTransferTaskData } from "tasks/definitions/TransferTask";
import { createUpgradeTaskData } from "tasks/definitions/UpgradeTask";
import { containerIsSourceTied } from "./ResourceManager";

export function getDefaultRoomMemory(): RoomMemory {
    return { numHarvestSpots: 0, anchorSpawnId: undefined };
}

export function setupRoomMemory(room: Room, taskManager: TaskManager) {
    if (room.memory === undefined || room.memory.numHarvestSpots === undefined) {
        room.memory = getDefaultRoomMemory();
    }

    const spawns = room.find(FIND_MY_SPAWNS);

    /**
     * The first spawn placed in a room is stable and permanent.
     * Screeps returns spawns in creation order.
     */
    if (spawns.length > 0) {
        const anchor = spawns[0];

        room.memory.anchorSpawnId = anchor.id;
    }

    console.log("inital room amount", room.memory.numHarvestSpots);

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

    const myStructures = room.find(FIND_MY_STRUCTURES);

    const extensions = myStructures.filter((s): s is StructureExtension => s.structureType === STRUCTURE_EXTENSION);
    console.log("extensions", extensions.length);
    extensions.forEach(extension => {
        const taskData = createTransferTaskData(extension);
        taskManager.add(taskData);
    });

    const containers = room
        .find(FIND_STRUCTURES)
        .filter((s): s is StructureContainer => s.structureType == STRUCTURE_CONTAINER);
    containers.forEach(container => {
        if (!containerIsSourceTied(container)) {
            const taskData = createTransferTaskData(container);
            taskManager.add(taskData);
        }
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
