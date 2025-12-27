import { DEFAULT_CREEP_MEMORY } from "creeps/CreepMemory";

const TARGET_CREEPS = 4;

function countCreeps(): number {
    return Object.keys(Game.creeps).length;
}

function getWorkerBody(energyAvailable: number): BodyPartConstant[] {
    if (energyAvailable >= 300) {
        return [WORK, CARRY, MOVE];
    }

    if (energyAvailable >= 200) {
        return [WORK, MOVE];
    }

    return [MOVE];
}

export function runSpawning(): void {
    const spawns = Object.values(Game.spawns);
    if (spawns.length === 0) return;

    const spawn = spawns[0];
    if (spawn.spawning) return;

    const creepCount = countCreeps();
    if (creepCount >= TARGET_CREEPS) return;

    const body = getWorkerBody(spawn.room.energyAvailable);
    const name = `worker-${Game.time}`;

    const result = spawn.spawnCreep(body, name, {
        memory: DEFAULT_CREEP_MEMORY
    });

    if (result !== OK) {
        console.log(`Spawn failed: ${result}`);
    }
}
