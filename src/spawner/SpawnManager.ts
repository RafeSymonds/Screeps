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
    | { kind: SpawnIntentKind.MINER; mine: number }
    | { kind: SpawnIntentKind.HAULER; carryNeeded: number }
    | { kind: SpawnIntentKind.WORKER; work: number };

/* ============================================================
   BODY BUILDERS
   ============================================================ */

function scoutBody(): BodyPartConstant[] {
    return [MOVE];
}

function minerBody(energy: number, mineNeeded: number): BodyPartConstant[] {
    const maxWork = Math.floor((energy - 50) / 100);
    const work = Math.max(1, Math.min(mineNeeded, maxWork));
    return [MOVE, ...Array(work).fill(WORK)];
}

function desiredHaulerCarry(room: Room): number {
    const cap = room.energyCapacityAvailable;

    // Stepwise, stable progression
    if (cap < 550) return 2; // RCL 1–2
    if (cap < 800) return 4; // RCL 3
    if (cap < 1300) return 6; // RCL 4
    if (cap < 1800) return 8; // RCL 5
    if (cap < 2300) return 12; // RCL 6
    return 16; // RCL 7+
}

function haulerBody(room: Room, energy: number, carryNeeded: number): BodyPartConstant[] {
    const targetCarry = desiredHaulerCarry(room);

    // Don’t oversize if demand is small
    const carry = Math.max(2, Math.min(carryNeeded, targetCarry, Math.floor(energy / 100)));

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
    mine: number; // WORK parts on miners
    work: number; // WORK parts on workers
    carry: number; // total CARRY parts
    scout: number;
};

function deriveSupply(worldRoom: WorldRoom): SupplyTotals {
    const supply: SupplyTotals = { mine: 0, work: 0, carry: 0, scout: 0 };

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
    scout: number;
};

function deriveDemand(tasks: { requirements(): TaskRequirements }[]): DemandTotals {
    const demand: DemandTotals = { mine: 0, work: 0, scout: 0 };

    for (const task of tasks) {
        const r = task.requirements();

        if (r.mine) demand.mine += r.mine;
        if (r.work) demand.work += r.work;
        if (r.vision) demand.scout += 1;
    }

    return demand;
}

function imbalanceScore(supplyMine: number, supplyCarry: number, targetMine: number, targetCarry: number): number {
    const mineRatio = supplyMine / Math.max(1, targetMine);
    const carryRatio = supplyCarry / Math.max(1, targetCarry);
    return Math.abs(mineRatio - carryRatio);
}

/* ============================================================
   HAULING DEMAND (DERIVED FROM MINING)
   ============================================================ */

function deriveHaulingDemand(supply: SupplyTotals): number {
    const energyPerTick = supply.mine * ENERGY_PER_WORK_PER_TICK;
    return Math.ceil(energyPerTick / CARRY_CAPACITY);
}

/* ============================================================
   SPAWN DECISION
   ============================================================ */

function selectSpawnIntent(supply: SupplyTotals, demand: DemandTotals, room: Room): SpawnIntent | null {
    const minerDeficit = Math.max(0, demand.mine - supply.mine);

    const haulDemand = deriveHaulingDemand(supply);
    const carryDeficit = Math.max(0, haulDemand - supply.carry);

    const workDeficit = Math.max(0, demand.work - supply.work);
    const scoutDeficit = Math.max(0, demand.scout - supply.scout);

    // 0️⃣ Bootstrap mining
    if (minerDeficit > 0 && supply.mine === 0) {
        return { kind: SpawnIntentKind.MINER, mine: minerDeficit };
    }

    // 1️⃣ Bootstrap hauling (mining-limited)
    if (carryDeficit > 0 && supply.carry === 0) {
        return { kind: SpawnIntentKind.HAULER, carryNeeded: carryDeficit };
    }

    // 2️⃣ Scouting
    if (demand.scout > 0 && supply.scout === 0) {
        return { kind: SpawnIntentKind.SCOUT };
    }

    if (minerDeficit > 0 || carryDeficit > 0) {
        const mineAfter = imbalanceScore(supply.mine + 1, supply.carry, demand.mine, haulDemand);

        const carryAfter = imbalanceScore(
            supply.mine,
            supply.carry + desiredHaulerCarry(room),
            demand.mine,
            haulDemand
        );

        if (minerDeficit > 0 && mineAfter <= carryAfter) {
            return { kind: SpawnIntentKind.MINER, mine: minerDeficit };
        }

        if (carryDeficit > 0) {
            return { kind: SpawnIntentKind.HAULER, carryNeeded: carryDeficit };
        }
    }

    // 5️⃣ Workers last
    if (workDeficit > 0) {
        return { kind: SpawnIntentKind.WORKER, work: workDeficit };
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

        const intent = selectSpawnIntent(supply, demand, worldRoom.room);
        if (!intent) return;

        const energy = room.energyAvailable;
        let body: BodyPartConstant[] | null = null;

        switch (intent.kind) {
            case SpawnIntentKind.SCOUT:
                body = scoutBody();
                break;
            case SpawnIntentKind.MINER:
                body = minerBody(energy, intent.mine);
                break;
            case SpawnIntentKind.HAULER:
                body = haulerBody(room, energy, intent.carryNeeded);
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
