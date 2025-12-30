import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { getDefaultCreepMemory } from "creeps/CreepMemory";
import { countBodyParts, hasBodyPart } from "creeps/CreepUtils";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { CreepState } from "creeps/CreepState";

/* ============================================================
   CONSTANTS
   ============================================================ */

// Mining
const ENERGY_PER_WORK_PER_TICK = 2;

// Hauling
const CARRY_CAPACITY = 50;
const HAUL_TICKS_PER_TRIP = 50; // avg; remotes already encoded in mining tasks

// Hauler sizing
const MIN_HAULER_CARRY = 2;
const MAX_HAULER_CARRY = 16;

// Weighting
const TASK_CARRY_WEIGHT = 0.35; // tasks influence hauling, but never dominate

/* ============================================================
   SPAWN INTENTS
   ============================================================ */

export enum SpawnIntentKind {
    SCOUT,
    MINER,
    HAULER,
    WORKER
}

type SpawnIntent =
    | { kind: SpawnIntentKind.SCOUT }
    | { kind: SpawnIntentKind.MINER }
    | { kind: SpawnIntentKind.HAULER }
    | { kind: SpawnIntentKind.WORKER };

/* ============================================================
   BODY BUILDERS
   ============================================================ */

function scoutBody(): BodyPartConstant[] {
    return [MOVE];
}

function minerBody(energy: number): BodyPartConstant[] {
    const maxWork = Math.floor((energy - 50) / 100);
    const work = Math.max(1, maxWork);
    return [MOVE, ...Array(work).fill(WORK)];
}

function desiredHaulerCarry(room: Room): number {
    const cap = room.energyCapacityAvailable;

    if (cap < 550) return 2;
    if (cap < 800) return 4;
    if (cap < 1300) return 6;
    if (cap < 1800) return 8;
    if (cap < 2300) return 12;
    return 16;
}

function haulerBody(room: Room, energy: number): BodyPartConstant[] {
    const target = desiredHaulerCarry(room);
    const maxFromEnergy = Math.floor(energy / 100);

    const carry = Math.max(MIN_HAULER_CARRY, Math.min(target, maxFromEnergy, MAX_HAULER_CARRY));

    const body: BodyPartConstant[] = [];
    for (let i = 0; i < carry; i++) body.push(CARRY, MOVE);
    return body;
}

function workerBody(energy: number): BodyPartConstant[] {
    const units = Math.max(1, Math.floor(energy / 200));
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < units; i++) body.push(WORK, CARRY, MOVE);
    return body;
}

/* ============================================================
   CREEP CLASSIFICATION
   ============================================================ */

function isMiner(cs: CreepState): boolean {
    return hasBodyPart(cs.creep, WORK) && !hasBodyPart(cs.creep, CARRY);
}

function isWorker(cs: CreepState): boolean {
    return hasBodyPart(cs.creep, WORK) && hasBodyPart(cs.creep, CARRY);
}

function isScout(cs: CreepState): boolean {
    return hasBodyPart(cs.creep, MOVE) && !hasBodyPart(cs.creep, WORK) && !hasBodyPart(cs.creep, CARRY);
}

/* ============================================================
   SUPPLY TOTALS
   ============================================================ */

type SupplyTotals = {
    mine: number; // WORK on miners
    carry: number; // total CARRY
    work: number; // WORK on workers
    scout: number;
};

function deriveSupply(worldRoom: WorldRoom): SupplyTotals {
    const supply: SupplyTotals = { mine: 0, carry: 0, work: 0, scout: 0 };

    for (const cs of worldRoom.myCreeps) {
        if (isMiner(cs)) {
            supply.mine += countBodyParts(cs.creep, WORK);
        } else if (isWorker(cs)) {
            supply.work += countBodyParts(cs.creep, WORK);
            supply.carry += countBodyParts(cs.creep, CARRY);
        } else if (isScout(cs)) {
            supply.scout += 1;
        } else {
            supply.carry += countBodyParts(cs.creep, CARRY);
        }
    }

    return supply;
}

/* ============================================================
   TASK DEMAND (MINING IS AUTHORITATIVE)
   ============================================================ */

type DemandTotals = {
    mine: number;
    work: number;
    carryHint: number;
    scout: number;
};

function deriveDemand(tasks: { requirements(): TaskRequirements }[]): DemandTotals {
    const demand: DemandTotals = { mine: 0, work: 0, carryHint: 0, scout: 0 };

    for (const task of tasks) {
        const r = task.requirements();
        if (r.mine) demand.mine += r.mine;
        if (r.work) demand.work += r.work;
        if (r.carry) demand.carryHint += r.carry;
        if (r.vision) demand.scout += 1;
    }

    return demand;
}

/* ============================================================
   HAULING DEMAND (MINING-BASED, TASK-NUDGED)
   ============================================================ */

function haulingFromMining(supplyMine: number): number {
    const energyPerTick = supplyMine * ENERGY_PER_WORK_PER_TICK;
    const energyPerTrip = energyPerTick * HAUL_TICKS_PER_TRIP;
    return Math.ceil(energyPerTrip / CARRY_CAPACITY);
}

function effectiveCarryDemand(supply: SupplyTotals, demand: DemandTotals): number {
    const miningBased = haulingFromMining(supply.mine);
    const taskBased = demand.carryHint;

    return Math.ceil(miningBased * (1 - TASK_CARRY_WEIGHT) + taskBased * TASK_CARRY_WEIGHT);
}

/* ============================================================
   IMBALANCE SCORING
   ============================================================ */

function imbalance(supplyMine: number, supplyCarry: number, targetMine: number, targetCarry: number): number {
    const mineRatio = supplyMine / Math.max(1, targetMine);
    const carryRatio = supplyCarry / Math.max(1, targetCarry);
    return Math.abs(mineRatio - carryRatio);
}

/* ============================================================
   SPAWN DECISION
   ============================================================ */

function selectSpawnIntent(room: Room, supply: SupplyTotals, demand: DemandTotals): SpawnIntent | null {
    const targetMine = demand.mine;
    const targetCarry = effectiveCarryDemand(supply, demand);

    const minerDeficit = targetMine - supply.mine;
    const carryDeficit = targetCarry - supply.carry;

    const workDeficit = demand.work - supply.work;
    const scoutDeficit = demand.scout - supply.scout;

    // 0️⃣ Bootstrap mining
    if (supply.mine === 0 && minerDeficit > 0) {
        return { kind: SpawnIntentKind.MINER };
    }

    // 2️⃣ Balance mining vs hauling
    if (minerDeficit > 0 || carryDeficit > 0) {
        const minerScore =
            minerDeficit > 0 ? imbalance(supply.mine + 1, supply.carry, targetMine, targetCarry) : Infinity;

        const carryScore =
            carryDeficit > 0
                ? imbalance(supply.mine, supply.carry + desiredHaulerCarry(room), targetMine, targetCarry)
                : Infinity;

        if (minerScore <= carryScore) {
            return { kind: SpawnIntentKind.MINER };
        } else {
            return { kind: SpawnIntentKind.HAULER };
        }
    }

    // 1️⃣ Scout
    if (demand.scout > 0 && supply.scout == 0) {
        return { kind: SpawnIntentKind.SCOUT };
    }

    // 3️⃣ Workers last
    if (workDeficit > 0) {
        return { kind: SpawnIntentKind.WORKER };
    }

    return null;
}

/* ============================================================
   SPAWN MANAGER
   ============================================================ */

export class SpawnManager {
    public run(world: World): void {
        for (const worldRoom of world.rooms.values()) {
            this.runRoom(worldRoom, world);
        }
    }

    private runRoom(worldRoom: WorldRoom, world: World): void {
        const room = worldRoom.room;
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (!spawn || spawn.spawning) return;

        const supply = deriveSupply(worldRoom);
        const tasks = world.taskManager.getTasksForRoom(room);
        const demand = deriveDemand(tasks);

        const intent = selectSpawnIntent(room, supply, demand);
        if (!intent) return;

        const energy = room.energyAvailable;
        let body: BodyPartConstant[] | null = null;

        switch (intent.kind) {
            case SpawnIntentKind.SCOUT:
                body = scoutBody();
                break;
            case SpawnIntentKind.MINER:
                body = minerBody(energy);
                break;
            case SpawnIntentKind.HAULER:
                body = haulerBody(room, energy);
                break;
            case SpawnIntentKind.WORKER:
                body = workerBody(energy);
                break;
        }

        if (!body || body.length === 0) return;

        spawn.spawnCreep(body, `${SpawnIntentKind[intent.kind]}-${Game.time}`, {
            memory: getDefaultCreepMemory(room.name)
        });
    }
}
