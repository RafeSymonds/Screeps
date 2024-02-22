import * as priorities from "./priorities";

export function spawnCreepInRoom(room: Room)
{
    if (room.memory.harvesterCreepCount < room.memory.harvesterLimit && room.memory.harvesterCreepCount < room.memory.transporterCreepCount * 2.5 + 1)
    {
        spawnHarvester(room);
    }
    else if (room.memory.harvesterCreepCount / 2.5 + 1 > room.memory.transporterCreepCount)
    {
        //spawn transporter
        spawnTransporter(room);
    }
    else if (room.memory.workerCreepCount < 8)
    {
        //spawn worker
        spawnWorker(room);
    }
}

export function spawnWorker(room: Room)
{
    let spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);
    let taskTypes: priorities.TaskType = priorities.TaskType.work;
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
        room.memory.workerCreepCount += 1;
        setValueLeftAfterSpawning(room);
    }

}

export function spawnTransporter(room: Room)
{
    let spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);
    let taskTypes: priorities.TaskType = priorities.TaskType.transport;
    let taskIDs: string[] = [];
    if (spawns[0].spawnCreep([CARRY, MOVE], 'Transporter' + Game.time, { memory: { role: taskTypes, taskID: taskIDs, workAmountLeft: 0, roomName: room.name } }) === OK)
    {
        room.memory.transporterCreepCount += 1;
        setValueLeftAfterSpawning(room);
    }

}

export function spawnHarvester(room: Room)
{
    let spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);
    let taskTypes: priorities.TaskType = priorities.TaskType.harvest;
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
        room.memory.harvesterCreepCount += 1;
        setValueLeftAfterSpawning(room);
    }
}

export function setValueLeftAfterSpawning(room: Room)
{
    let spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);

    spawns.forEach(spawn =>
    {
        room.memory.tasks[spawn.id].valueLeft = spawn.store.getCapacity(RESOURCE_ENERGY);
    });

    let extensions: StructureExtension[] = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } });
    extensions.forEach(extension =>
    {
        room.memory.tasks[extension.id].valueLeft = extension.store.getCapacity(RESOURCE_ENERGY);
    });
}
