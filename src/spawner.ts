import * as GeneralTask from "./Tasks/generalTask";

export function spawnCreepInRoom(room: Room)
{
    if (global.roomMemory[room.name].harvesterCreepCount < global.roomMemory[room.name].harvesterLimit && global.roomMemory[room.name].harvesterCreepCount < global.roomMemory[room.name].transporterCreepCount * 2 + 1)
    {
        spawnHarvester(room);
    }
    else if (global.roomMemory[room.name].harvesterCreepCount * 2 + 1 > global.roomMemory[room.name].transporterCreepCount)
    {
        //spawn transporter
        spawnTransporter(room);
    }
    else if (global.roomMemory[room.name].workerCreepCount < 8)
    {
        //spawn worker
        spawnWorker(room);
    }
}

export function spawnWorker(room: Room)
{
    let spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);
    let taskTypes: GeneralTask.TaskType = GeneralTask.TaskType.work;
    let taskIDs: string[] = [];
    let bodyParts: BodyPartConstant[] = [WORK, CARRY, MOVE, MOVE];

    let energyAvailable: number = room.energyAvailable - 250;

    while (energyAvailable - 150 > ((bodyParts.length - 2) / 2 * 50) && bodyParts.length < 8)
    {
        bodyParts.push(WORK);
        bodyParts.push(CARRY);
        energyAvailable -= 150;
    }
    let moevPartsNeed: number = (bodyParts.length - 2) / 2 - 2;
    for (let movePart = 0; movePart < moevPartsNeed; movePart++)
    {
        bodyParts.push(MOVE);
    }

    if (spawns[0].spawnCreep(bodyParts, 'Worker' + Game.time, { memory: { role: taskTypes, taskID: taskIDs, workAmountLeft: 0, roomName: room.name } }) === OK)
    {
        global.roomMemory[room.name].workerCreepCount += 1;
        setValueLeftAfterSpawning(room);
    }

}

export function spawnTransporter(room: Room)
{
    let spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);
    let taskTypes: GeneralTask.TaskType = GeneralTask.TaskType.transport;
    let taskIDs: string[] = [];
    if (spawns[0].spawnCreep([CARRY, MOVE], 'Transporter' + Game.time, { memory: { role: taskTypes, taskID: taskIDs, workAmountLeft: 0, roomName: room.name } }) === OK)
    {
        global.roomMemory[room.name].transporterCreepCount += 1;
        setValueLeftAfterSpawning(room);
    }

}

export function spawnHarvester(room: Room)
{
    let spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);
    let taskTypes: GeneralTask.TaskType = GeneralTask.TaskType.harvest;
    let taskIDs: string[] = [];

    let bodyParts: BodyPartConstant[] = [MOVE, WORK, WORK];

    let energy: number = room.energyAvailable - 250;
    while (energy >= 100 && bodyParts.length < 6)
    {
        bodyParts.push(WORK);
        energy -= 100;
    }

    if (spawns[0].spawnCreep(bodyParts, 'Harvester' + Game.time, { memory: { role: taskTypes, taskID: taskIDs, workAmountLeft: 0, roomName: room.name } }) === OK)
    {
        global.roomMemory[room.name].harvesterCreepCount += 1;
        setValueLeftAfterSpawning(room);
    }
}

export function setValueLeftAfterSpawning(room: Room)
{
    let spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);

    spawns.forEach(spawn =>
    {
        global.roomMemory[room.name].tasks[spawn.id].updateValueLeft()
    });

    let extensions: StructureExtension[] = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } });
    extensions.forEach(extension =>
    {
        global.roomMemory[room.name].tasks[extension.id].updateValueLeft()
    });
}
