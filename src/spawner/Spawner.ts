import { DEFAULT_CREEP_MEMORY } from "creeps/CreepMemory";
import { hasBodyPart } from "creeps/CreepUtils";

/* ================================
   TUNABLE CONSTANTS
   ================================ */

// Mining math
const TARGET_WORK_PER_SOURCE = 5; // exact: 5 WORK fully drains a source
const MAX_MINER_WORK = 5;

// Transport math
const TARGET_CARRY_PER_WORK = 1; // 1 CARRY per WORK (early-game safe)

// Flexibility
const TARGET_WORKERS = 2;

/* ================================
   CAPABILITY COUNTING
   ================================ */

function countBodyParts(part: BodyPartConstant): number {
    let count = 0;
    for (const creep of Object.values(Game.creeps)) {
        for (const body of creep.body) {
            if (body.type === part) count++;
        }
    }
    return count;
}

function totalWork(): number {
    return countBodyParts(WORK);
}

function totalCarry(): number {
    return countBodyParts(CARRY);
}

function countWorkers(): number {
    return Object.values(Game.creeps).filter(
        creep => hasBodyPart(creep, WORK) && hasBodyPart(creep, CARRY) && hasBodyPart(creep, MOVE)
    ).length;
}

/* ================================
   BODY BUILDERS
   ================================ */

// Miner: 1 MOVE + up to 5 WORK
function getMinerBody(energy: number): BodyPartConstant[] {
    const body: BodyPartConstant[] = [MOVE];
    let remaining = energy - 50;

    if (remaining < 100) {
        body.push(WORK);
        return body;
    }

    const workParts = Math.min(MAX_MINER_WORK, Math.floor(remaining / 100));

    for (let i = 0; i < workParts; i++) {
        body.push(WORK);
    }

    return body;
}

// Hauler: CARRY/MOVE pairs
function getHaulerBody(energy: number): BodyPartConstant[] {
    const body: BodyPartConstant[] = [];
    const pairs = Math.floor(energy / 100);

    for (let i = 0; i < pairs; i++) {
        body.push(CARRY, MOVE);
    }

    if (body.length === 0) {
        body.push(CARRY, MOVE);
    }

    return body;
}

// Worker: WORK + CARRY + MOVE units
function getWorkerBody(energy: number): BodyPartConstant[] {
    const body: BodyPartConstant[] = [];
    const unitCost = 200; // WORK + CARRY + MOVE

    const units = Math.floor(energy / unitCost);
    if (units === 0) return [WORK, CARRY, MOVE];

    for (let i = 0; i < units; i++) {
        body.push(WORK, CARRY, MOVE);
    }

    return body;
}

/* ================================
   FLOW-CONTROL MATH
   ================================ */

// Maximum WORK supported by both sources AND hauling
function desiredWork(room: Room): number {
    const sources = room.find(FIND_SOURCES).length;
    const sourceLimit = sources * TARGET_WORK_PER_SOURCE;
    const transportLimit = Math.floor(totalCarry() / TARGET_CARRY_PER_WORK);

    return Math.min(sourceLimit, Math.max(transportLimit, 1));
}

function shouldSpawnMiner(room: Room): boolean {
    return totalWork() < desiredWork(room);
}

function shouldSpawnHauler(room: Room): boolean {
    const sources = room.find(FIND_SOURCES).length;
    const maxUsefulWork = sources * TARGET_WORK_PER_SOURCE;
    return totalCarry() < maxUsefulWork * TARGET_CARRY_PER_WORK && totalWork() > 0;
}

function shouldSpawnWorker(): boolean {
    return countWorkers() < TARGET_WORKERS;
}

/* ================================
   MAIN SPAWNING LOOP
   ================================ */

export function runSpawning(): void {
    const spawn = Object.values(Game.spawns)[0];
    if (!spawn) return;
    if (spawn.spawning) return;

    const energy = spawn.room.energyAvailable;

    let body: BodyPartConstant[] | null = null;

    let name = "";
    // IMPORTANT: transport enables production
    if (shouldSpawnHauler(spawn.room)) {
        name = `hauler-${Game.time}`;
        body = getHaulerBody(energy);
    } else if (shouldSpawnMiner(spawn.room)) {
        name = `miner-${Game.time}`;
        body = getMinerBody(energy);
    } else if (shouldSpawnWorker()) {
        name = `worker-${Game.time}`;
        body = getWorkerBody(energy);
    } else {
        return; // system balanced
    }

    const result = spawn.spawnCreep(body, name, {
        memory: DEFAULT_CREEP_MEMORY
    });
}
