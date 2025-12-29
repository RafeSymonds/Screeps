import { getDefaultCreepMemory } from "creeps/CreepMemory";
import { CreepState } from "creeps/CreepState";
import { countBodyParts, hasBodyPart } from "creeps/CreepUtils";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";

/* ================================
   CONSTANTS
   ================================ */

const MAX_WORK_PER_MINER = 5;
const MAX_WORK_PER_SOURCE = 5;

const TARGET_WORKERS = 10;

const MINER_MIN_COST = 250; // MOVE + 2x WORK
const HAULER_MIN_COST = 100; // CARRY + MOVE

// Hauling math
const CARRY_PER_WORK = 1.5; // tune per distance / roads

/* ================================
   ROLE HELPERS
   ================================ */

function isMiner(cs: CreepState): boolean {
    return hasBodyPart(cs.creep, WORK) && !hasBodyPart(cs.creep, CARRY);
}

function isHauler(cs: CreepState): boolean {
    return hasBodyPart(cs.creep, CARRY) && !hasBodyPart(cs.creep, WORK);
}

function isWorker(cs: CreepState): boolean {
    return hasBodyPart(cs.creep, WORK) && hasBodyPart(cs.creep, CARRY) && hasBodyPart(cs.creep, MOVE);
}

/* ================================
   CAPACITY HELPERS
   ================================ */

function countTotalMinerWork(worldRoom: WorldRoom): number {
    return worldRoom.myCreeps.filter(isMiner).reduce((sum, cs) => sum + countBodyParts(cs.creep, WORK), 0);
}

function countTotalHaulerCarry(worldRoom: WorldRoom): number {
    return worldRoom.myCreeps.filter(isHauler).reduce((sum, cs) => sum + countBodyParts(cs.creep, CARRY), 0);
}

function countWorkers(worldRoom: WorldRoom): number {
    return worldRoom.myCreeps.filter(isWorker).length;
}

/* ================================
   BODY BUILDERS
   ================================ */

function minerBody(energy: number, remainingWork: number): BodyPartConstant[] {
    const maxAffordableWork = Math.floor((energy - 50) / 100);
    const work = Math.max(1, Math.min(MAX_WORK_PER_MINER, remainingWork, maxAffordableWork));

    return [MOVE, ...Array(work).fill(WORK)];
}

const HAULER_CARRY_RATIO = 2; // 2C : 1M → full speed on roads

function haulerBody(energy: number): BodyPartConstant[] {
    const unitCost = HAULER_CARRY_RATIO * 50 + 50;
    const units = Math.max(1, Math.floor(energy / unitCost));

    const body: BodyPartConstant[] = [];
    for (let i = 0; i < units; i++) {
        body.push(...Array(HAULER_CARRY_RATIO).fill(CARRY), MOVE);
    }

    return body;
}

const WORK_RATIO = 2;
const CARRY_RATIO = 1;
const MOVE_RATIO = 1;

function workerBody(energy: number): BodyPartConstant[] {
    const unitCost = WORK_RATIO * 100 + CARRY_RATIO * 50 + MOVE_RATIO * 50;

    const units = Math.max(1, Math.floor(energy / unitCost));

    const body: BodyPartConstant[] = [];
    for (let i = 0; i < units; i++) {
        body.push(...Array(WORK_RATIO).fill(WORK), ...Array(CARRY_RATIO).fill(CARRY), ...Array(MOVE_RATIO).fill(MOVE));
    }

    return body;
}

/* ================================
   MAIN SPAWNING LOGIC
   ================================ */

function roomSpawning(worldRoom: WorldRoom): void {
    const room = worldRoom.room;
    const spawns = room.find(FIND_MY_SPAWNS);
    if (spawns.length === 0) return;

    const energy = room.energyAvailable;

    const totalMinerWork = countTotalMinerWork(worldRoom);
    const totalHaulerCarry = countTotalHaulerCarry(worldRoom);
    const workers = countWorkers(worldRoom);

    const numSources = room.find(FIND_SOURCES).length;
    const maxMiningWork = numSources * MAX_WORK_PER_SOURCE;

    const targetCarry = Math.ceil(totalMinerWork * CARRY_PER_WORK);

    let body: BodyPartConstant[] | null = null;
    let name = "";

    /*
     1️⃣ BOOTSTRAP — must be able to mine at all
    */
    if (totalMinerWork === 0) {
        if (energy < MINER_MIN_COST) return;

        body = minerBody(energy, MAX_WORK_PER_SOURCE);
        name = `miner-${Game.time}`;
    } else if (totalHaulerCarry < targetCarry) {
        /*
     2️⃣ HAULING — scale by total WORK
    */
        if (energy < HAULER_MIN_COST) return;

        body = haulerBody(energy);
        name = `hauler-${Game.time}`;
    } else if (totalMinerWork < maxMiningWork) {
        /*
     3️⃣ MINING — fill remaining WORK only
    */
        const remainingWork = maxMiningWork - totalMinerWork;
        if (energy < MINER_MIN_COST) return;

        body = minerBody(energy, remainingWork);
        name = `miner-${Game.time}`;
    } else if (workers < TARGET_WORKERS) {
        /*
     4️⃣ WORKERS — only after economy is stable
    */
        body = workerBody(energy);
        name = `worker-${Game.time}`;
    } else {
        return;
    }

    spawns[0].spawnCreep(body, name, {
        memory: getDefaultCreepMemory(room.name)
    });
}

export function runSpawning(world: World): void {
    world.rooms.forEach(room => roomSpawning(room));
}
