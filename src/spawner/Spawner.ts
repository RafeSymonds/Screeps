import { DEFAULT_CREEP_MEMORY } from "creeps/CreepMemory";
import { hasBodyPart } from "creeps/CreepUtils";

/* ================================
   CONSTANTS
   ================================ */

const MAX_WORK_PER_MINER = 5;
const TARGET_WORKERS = 2;

const MINER_MIN_COST = 150; // MOVE + WORK
const HAULER_MIN_COST = 100; // CARRY + MOVE

/* ================================
   ROOM HELPERS
   ================================ */

function creepsInRoom(room: Room): Creep[] {
    return Object.values(Game.creeps).filter(c => c.room.name === room.name);
}

function isMiner(c: Creep): boolean {
    return hasBodyPart(c, WORK) && !hasBodyPart(c, CARRY);
}

function isHauler(c: Creep): boolean {
    return hasBodyPart(c, CARRY) && !hasBodyPart(c, WORK);
}

function isWorker(c: Creep): boolean {
    return hasBodyPart(c, WORK) && hasBodyPart(c, CARRY) && hasBodyPart(c, MOVE);
}

function count(room: Room, pred: (c: Creep) => boolean): number {
    return creepsInRoom(room).filter(pred).length;
}

/* ================================
   BODY BUILDERS
   ================================ */

function minerBody(energy: number): BodyPartConstant[] {
    const work = Math.min(MAX_WORK_PER_MINER, Math.max(1, Math.floor((energy - 50) / 100)));
    return [MOVE, ...Array(work).fill(WORK)];
}

function haulerBody(): BodyPartConstant[] {
    // deliberately small + stable
    return [CARRY, MOVE];
}

function workerBody(energy: number): BodyPartConstant[] {
    const units = Math.max(1, Math.floor(energy / 200));
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < units; i++) {
        body.push(WORK, CARRY, MOVE);
    }
    return body;
}

/* ================================
   MAIN SPAWNING LOGIC
   ================================ */

export function runSpawning(): void {
    const spawn = Object.values(Game.spawns)[0];
    if (!spawn || spawn.spawning) return;

    const room = spawn.room;
    const energy = room.energyAvailable;

    const miners = count(room, isMiner);
    const haulers = count(room, isHauler);
    const workers = count(room, isWorker);
    const sources = room.find(FIND_SOURCES).length;

    let body: BodyPartConstant[] | null = null;
    let name = "";

    /*
     1️⃣ ABSOLUTE BOOTSTRAP RULE
        - No haulers without miners
    */
    if (miners === 0) {
        if (energy < MINER_MIN_COST) return; // wait, do NOT spawn haulers
        body = minerBody(energy);
        name = `miner-${Game.time}`;
    } else if (haulers < miners * 3) {
        if (energy < HAULER_MIN_COST) return;
        body = haulerBody();
        name = `hauler-${Game.time}`;
    } else if (miners < sources) {
        /*
     3️⃣ Scale miners only if hauling matches
    */
        if (energy < MINER_MIN_COST) return;
        body = minerBody(energy);
        name = `miner-${Game.time}`;
    } else if (workers < TARGET_WORKERS) {
        /*
     4️⃣ Workers only after economy is stable
    */
        body = workerBody(energy);
        name = `worker-${Game.time}`;
    } else {
        return;
    }

    spawn.spawnCreep(body, name, {
        memory: DEFAULT_CREEP_MEMORY
    });
}
