import { TaskInfo, Task, TaskType, WorkType, CreepMatchesTask } from "tasks/abstract_task";

export function spawnCreepInRoom(room: Room) {
    let harvesterCreepCount = room.memory.harvesterCreepCount;
    let harvesterLimit = room.memory.harvesterLimit;

    let transporterCreepCount = room.memory.transporterCreepCount;
    let workerCreepCount = room.memory.workerCreepCount;

    if (harvesterCreepCount < harvesterLimit && harvesterCreepCount < transporterCreepCount * 2 + 1) {
        spawnHarvester(room);
    } else if (harvesterCreepCount * 2 + 1 > transporterCreepCount) {
        //spawn transporter
        spawnTransporter(room);
    } else if (workerCreepCount < 8) {
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
        room.memory.workerCreepCount += 1;
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
        room.memory.transporterCreepCount += 1;
        global.pendingCreepNames.push(name);
        setValueLeftAfterSpawning(room);
    }
}

export function spawnHarvester(room: Room) {
    let spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);
    let taskTypes: TaskType = TaskType.harvest;

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
        console.log("spawning harvest");
        console.log(room.memory.harvesterCreepCount);
        room.memory.harvesterCreepCount += 1;
        console.log(room.memory.harvesterCreepCount);
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
