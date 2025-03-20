import * as AbstractTask from "tasks/abstract_task";
import { HarvestTask } from "tasks/harvest_task";

export function assignCreeps(room: Room) {
    let creeps = room.find(FIND_MY_CREEPS);

    let roomMemory = global.roomMemory[room.name];
    let roomTasks = roomMemory.tasks;

    creeps.forEach(creep => {
        for (const taskID in roomTasks) {
            let task = roomTasks[taskID].task;

            if (task.hasValueLeft() && task.checkCreepMatches(creep)) {
                task.assignCreep(creep);
            }
        }
    });
}

export function setUpTasks(room: Room): void {
    const sources: Source[] = room.find(FIND_SOURCES);
    sources.forEach(source => {
        if (!(source.id in global.roomMemory[room.name].tasks)) {
            new HarvestTask(source);
        }
    });

    const structures: Structure[] = room.find(FIND_STRUCTURES);
    structures.forEach(structure => {
        if (!(structure.id in global.roomMemory[room.name].tasks)) {
            let priority = 0;
            switch (structure.structureType) {
                case STRUCTURE_SPAWN:
                    priority = 3;
                    break;
                default:
                    break;
            }
        }
    });
}
