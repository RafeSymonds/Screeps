import * as AbstractTask from "tasks/abstract_task";
import { HarvestTask } from "tasks/harvest_task";
import { UpgradeControllerTask } from "tasks/upgrade_controller";
import { CreepMatchesTask } from "tasks/abstract_task";
import { TransportTask } from "tasks/transport_task";
import { constants } from "fs";

export function assignCreeps(room: Room) {
    let creeps = room.find(FIND_MY_CREEPS);

    let roomMemory = global.roomMemory[room.name];
    let roomTasks = roomMemory.tasks;

    let tasks: TaskInfo[] = Object.values(roomTasks);

    let taskInfos: TaskInfo[] = tasks.sort((a, b) => {
        return a.task.priority - b.task.priority;
    });

    // for (const task of taskInfos) {
    //     console.log(task.task.constructor.name);
    // }

    creeps.forEach(creep => {
        for (const taskInfo of taskInfos) {
            let task = taskInfo.task;

            if (
                task.hasValueLeft() &&
                !task.creeps.has(creep.id) &&
                task.checkCreepMatches(creep) === CreepMatchesTask.true
            ) {
                task.assignCreep(creep);
                break;
            }
        }
    });
}

export function setUpTasks(room: Room): void {
    const sources: Source[] = room.find(FIND_SOURCES);
    sources.forEach(source => {
        new HarvestTask(source);
    });

    const structures: Structure[] = room.find(FIND_STRUCTURES);
    structures.forEach(structure => {
        let priority = 0;
        switch (structure.structureType) {
            case STRUCTURE_CONTROLLER:
                new UpgradeControllerTask(structure as StructureController);
                break;
            case STRUCTURE_SPAWN:
                priority = 3;
                new TransportTask(structure as AnyStoreStructure, priority);
                break;
            default:
                break;
        }
    });
}
