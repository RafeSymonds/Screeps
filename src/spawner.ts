import { TaskInfo, Task, TaskType, WorkType, CreepMatchesTask } from "tasks/abstract_task";

export function spawnCreepInRoom(room: Room) {
    if (
        global.roomMemory[room.name].harvesterCreepCount < global.roomMemory[room.name].harvesterLimit &&
        global.roomMemory[room.name].harvesterCreepCount < global.roomMemory[room.name].transporterCreepCount * 2 + 1
    ) {
        spawnHarvester(room);
    } else if (
        global.roomMemory[room.name].harvesterCreepCount * 2 + 1 >
        global.roomMemory[room.name].transporterCreepCount
    ) {
        //spawn transporter
        spawnTransporter(room);
    } else if (global.roomMemory[room.name].workerCreepCount < 8) {
        //spawn worker
        spawnWorker(room);
    }
}

export function spawnWorker(room: Room) {
    let spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);
    let taskTypes: TaskType = TaskType.work;
    let bodyParts: BodyPartConstant[] = [WORK, CARRY, MOVE, MOVE];

    let energyAvailable: number = room.energyAvailable - 250;

    while (energyAvailable - 150 > ((bodyParts.length - 2) / 2) * 50 && bodyParts.length < 8) {
        bodyParts.push(WORK);
        bodyParts.push(CARRY);
        energyAvailable -= 150;
    }
    let moevPartsNeed: number = (bodyParts.length - 2) / 2 - 2;
    for (let movePart = 0; movePart < moevPartsNeed; movePart++) {
        bodyParts.push(MOVE);
    }

    let name = "Worker" + Game.time;
    if (
        spawns[0].spawnCreep(bodyParts, name, {
            memory: { role: taskTypes }
        }) === OK
    ) {
        global.roomMemory[room.name].workerCreepCount += 1;
        global.pendingCreepNames.push(name);
        setValueLeftAfterSpawning(room);
    }
}

export function spawnTransporter(room: Room) {
    let spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);
    let taskTypes: TaskType = TaskType.transport;
    let name = "Transporter" + Game.time;
    if (
        spawns[0].spawnCreep([CARRY, MOVE], name, {
            memory: { role: taskTypes }
        }) === OK
    ) {
        global.roomMemory[room.name].transporterCreepCount += 1;
        global.pendingCreepNames.push(name);
        setValueLeftAfterSpawning(room);
    }
}

export function spawnHarvester(room: Room) {
    let spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);
    let taskTypes: TaskType = TaskType.harvest;
    let taskIDs: string[] = [];

    let bodyParts: BodyPartConstant[] = [MOVE, WORK, WORK];

    let energy: number = room.energyAvailable - 250;
    while (energy >= 100 && bodyParts.length < 6) {
        bodyParts.push(WORK);
        energy -= 100;
    }

    let name = "Harvester" + Game.time;
    if (
        spawns[0].spawnCreep(bodyParts, name, {
            memory: { role: taskTypes }
        }) === OK
    ) {
        global.roomMemory[room.name].harvesterCreepCount += 1;
        global.pendingCreepNames.push(name);
        setValueLeftAfterSpawning(room);
    }
}
function setValueLeftAfterSpawning(room: Room) {
    let spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);

    spawns.forEach(spawn => {
        tasksNeedingRefresh.push([room.name, spawn.id]);
    });

    let extensions: StructureExtension[] = room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_EXTENSION }
    });
    extensions.forEach(extension => {
        tasksNeedingRefresh.push([room.name, extension.id]);
    });
}
