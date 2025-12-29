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

const CARRY_PER_WORK = 1.5;

/* ================================
   ENUMS & TYPES
   ================================ */

export enum SpawnIntentKind {
    MINER,
    HAULER,
    WORKER
}

export type SpawnIntent =
    | { kind: SpawnIntentKind.MINER; remainingWork: number }
    | { kind: SpawnIntentKind.HAULER }
    | { kind: SpawnIntentKind.WORKER };

/* ================================
   CAPABILITY HELPERS
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
   CAPACITY COUNTING
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

const HAULER_CARRY_RATIO = 2; // 2C : 1M

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
   INTENT EVALUATION (PURE LOGIC)
   ================================ */

function evaluateSpawnIntent(worldRoom: WorldRoom): SpawnIntent | null {
    const room = worldRoom.room;

    const totalMinerWork = countTotalMinerWork(worldRoom);
    const totalHaulerCarry = countTotalHaulerCarry(worldRoom);
    const workers = countWorkers(worldRoom);

    const numSources = room.find(FIND_SOURCES).length;
    const maxMiningWork = numSources * MAX_WORK_PER_SOURCE;

    const targetCarry = Math.ceil(totalMinerWork * CARRY_PER_WORK);

    // 1️⃣ Bootstrap
    if (totalMinerWork === 0) {
        return {
            kind: SpawnIntentKind.MINER,
            remainingWork: MAX_WORK_PER_SOURCE
        };
    }

    // 2️⃣ Hauling
    if (totalHaulerCarry < targetCarry) {
        return { kind: SpawnIntentKind.HAULER };
    }

    // 3️⃣ Mining
    if (totalMinerWork < maxMiningWork) {
        return {
            kind: SpawnIntentKind.MINER,
            remainingWork: maxMiningWork - totalMinerWork
        };
    }

    // 4️⃣ Workers
    if (workers < TARGET_WORKERS) {
        return { kind: SpawnIntentKind.WORKER };
    }

    return null;
}

/* ================================
   BODY RESOLUTION
   ================================ */

function buildBody(intent: SpawnIntent, energy: number): BodyPartConstant[] | null {
    switch (intent.kind) {
        case SpawnIntentKind.MINER:
            if (energy < MINER_MIN_COST) return null;
            return minerBody(energy, intent.remainingWork);

        case SpawnIntentKind.HAULER:
            if (energy < HAULER_MIN_COST) return null;
            return haulerBody(energy);

        case SpawnIntentKind.WORKER:
            return workerBody(energy);
    }
}

/* ================================
   SPAWN MANAGER
   ================================ */

export class SpawnManager {
    public run(world: World): void {
        for (const worldRoom of world.rooms.values()) {
            this.runRoom(worldRoom);
        }
    }

    private runRoom(worldRoom: WorldRoom): void {
        const room = worldRoom.room;
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (!spawn || spawn.spawning) return;

        const intent = evaluateSpawnIntent(worldRoom);
        if (!intent) return;

        const body = buildBody(intent, room.energyAvailable);
        if (!body) return;

        const name = `${SpawnIntentKind[intent.kind]}-${Game.time}`;

        spawn.spawnCreep(body, name, {
            memory: getDefaultCreepMemory(room.name)
        });
    }
}
