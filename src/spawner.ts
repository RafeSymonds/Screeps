import * as AbstractTask from "tasks/abstract_task";

export function spawnWorker(room: Room) {
    let spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);
    let taskTypes: AbstractTask.TaskType = AbstractTask.TaskType.work;
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
        global.pendingCreepNames.push(name);
    }
}
