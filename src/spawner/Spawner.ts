import { getDefaultCreepMemory } from "creeps/CreepMemory";
import { CreepState } from "creeps/CreepState";
import { hasBodyPart } from "creeps/CreepUtils";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";

/* ================================
   CONSTANTS
   ================================ */

const MAX_WORK_PER_MINER = 5;
const TARGET_WORKERS = 15;
const MAX_WORK_PER_SOURCE = 5;

const MINER_MIN_COST = 250; // MOVE + WORK + WORK
const HAULER_MIN_COST = 100; // CARRY + MOVE

/* ================================
   ROOM HELPERS
   ================================ */

function isMiner(creepState: CreepState): boolean {
    return hasBodyPart(creepState.creep, WORK) && !hasBodyPart(creepState.creep, CARRY);
}

function isHauler(creepState: CreepState): boolean {
    return hasBodyPart(creepState.creep, CARRY) && !hasBodyPart(creepState.creep, WORK);
}

function isWorker(creepState: CreepState): boolean {
    return (
        hasBodyPart(creepState.creep, WORK) &&
        hasBodyPart(creepState.creep, CARRY) &&
        hasBodyPart(creepState.creep, MOVE)
    );
}

function count(worldRoom: WorldRoom, pred: (creepState: CreepState) => boolean): number {
    return worldRoom.myCreeps.filter(pred).length;
}

/* ================================
   BODY BUILDERS
   ================================ */

function minerBody(energy: number): BodyPartConstant[] {
    const work = Math.min(MAX_WORK_PER_MINER, Math.max(2, Math.floor((energy - 50) / 100)));
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

function roomSpawning(worldRoom: WorldRoom): void {
    const room = worldRoom.room;

    const spawns = room.find(FIND_MY_SPAWNS);

    if (spawns.length === 0) {
        return;
    }

    const energy = room.energyAvailable;

    const miners = count(worldRoom, isMiner);
    const haulers = count(worldRoom, isHauler);
    const workers = count(worldRoom, isWorker);

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
    } else if (haulers < Math.ceil(miners * 1.5)) {
        if (energy < HAULER_MIN_COST) return;
        body = haulerBody();
        name = `hauler-${Game.time}`;
    } else if (miners < room.memory.numHarvestSpots) {
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

    spawns[0].spawnCreep(body, name, {
        memory: getDefaultCreepMemory()
    });
}

export function runSpawning(world: World): void {
    world.rooms.forEach(worldRoom => roomSpawning(worldRoom));
}
