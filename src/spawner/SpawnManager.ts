import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { getDefaultCreepMemory } from "creeps/CreepMemory";
import { countBodyParts, countCombatParts, hasBodyPart, hasCombatPart } from "creeps/CreepUtils";
import { TaskRequirements, requirementCreeps, requirementParts } from "tasks/core/TaskRequirements";
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
const PRESSURE_ALPHA = 0.35;
const SCOUT_PRESSURE_ALPHA = 0.5;
const PRESSURE_SPAWN_THRESHOLD = 0.2;

/* ============================================================
   SPAWN INTENTS
   ============================================================ */

export enum SpawnIntentKind {
    SCOUT,
    MINER,
    HAULER,
    WORKER,
    DEFENDER
}

type SpawnIntent =
    | { kind: SpawnIntentKind.SCOUT }
    | { kind: SpawnIntentKind.MINER }
    | { kind: SpawnIntentKind.HAULER }
    | { kind: SpawnIntentKind.WORKER }
    | { kind: SpawnIntentKind.DEFENDER };

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

function defenderBody(energy: number): BodyPartConstant[] {
    if (energy < 130) {
        return [];
    }

    if (energy < 200) {
        return [ATTACK, MOVE];
    }

    const body: BodyPartConstant[] = [];
    let remaining = energy;

    while (remaining >= 250 && body.length <= 47) {
        body.push(RANGED_ATTACK, MOVE, MOVE);
        remaining -= 250;
    }

    if (remaining >= 300 && body.length <= 48) {
        body.push(HEAL, MOVE);
        remaining -= 300;
    }

    if (body.length === 0) {
        return [RANGED_ATTACK, MOVE];
    }

    while (remaining >= 10 && body.length < 50 && body.filter(part => part === TOUGH).length < 4) {
        body.unshift(TOUGH);
        remaining -= 10;
    }

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

function isCombat(cs: CreepState): boolean {
    return hasCombatPart(cs.creep);
}

/* ============================================================
   SUPPLY TOTALS
   ============================================================ */

type SupplyTotals = {
    mine: number; // WORK on miners
    minerCreeps: number;
    idleMiners: number;
    carry: number; // total CARRY
    haulerCreeps: number;
    idleHaulers: number;
    work: number; // WORK on workers
    workerCreeps: number;
    idleWorkers: number;
    scout: number;
    idleScouts: number;
    combat: number;
    defenderCreeps: number;
    idleDefenders: number;
};

function deriveSupply(worldRoom: WorldRoom): SupplyTotals {
    const supply: SupplyTotals = {
        mine: 0,
        minerCreeps: 0,
        idleMiners: 0,
        carry: 0,
        haulerCreeps: 0,
        idleHaulers: 0,
        work: 0,
        workerCreeps: 0,
        idleWorkers: 0,
        scout: 0,
        idleScouts: 0,
        combat: 0,
        defenderCreeps: 0,
        idleDefenders: 0
    };

    for (const cs of worldRoom.myCreeps) {
        const idle = cs.memory.taskId === undefined;

        if (isCombat(cs)) {
            supply.combat += countCombatParts(cs.creep);
            supply.defenderCreeps += 1;
            if (idle) {
                supply.idleDefenders += 1;
            }
        } else if (isMiner(cs)) {
            supply.mine += countBodyParts(cs.creep, WORK);
            supply.minerCreeps += 1;
            if (idle) {
                supply.idleMiners += 1;
            }
        } else if (isWorker(cs)) {
            supply.work += countBodyParts(cs.creep, WORK);
            supply.workerCreeps += 1;
            supply.carry += countBodyParts(cs.creep, CARRY);
            if (idle) {
                supply.idleWorkers += 1;
            }
        } else if (isScout(cs)) {
            supply.scout += 1;
            if (idle) {
                supply.idleScouts += 1;
            }
        } else {
            const carryParts = countBodyParts(cs.creep, CARRY);
            supply.carry += carryParts;
            if (carryParts > 0) {
                supply.haulerCreeps += 1;
                if (idle) {
                    supply.idleHaulers += 1;
                }
            }
        }
    }

    return supply;
}

/* ============================================================
   TASK DEMAND (MINING IS AUTHORITATIVE)
   ============================================================ */

type DemandTotals = {
    mine: number;
    minerCreeps: number;
    work: number;
    workerCreeps: number;
    carryHint: number;
    haulerCreeps: number;
    scout: number;
    combat: number;
    defenderCreeps: number;
};

function deriveDemand(tasks: { requirements(): TaskRequirements }[]): DemandTotals {
    const demand: DemandTotals = {
        mine: 0,
        minerCreeps: 0,
        work: 0,
        workerCreeps: 0,
        carryHint: 0,
        haulerCreeps: 0,
        scout: 0,
        combat: 0,
        defenderCreeps: 0
    };

    for (const task of tasks) {
        const r = task.requirements();

        demand.mine += requirementParts(r.mine);
        demand.minerCreeps += requirementCreeps(r.mine);

        demand.work += requirementParts(r.work);
        demand.workerCreeps += requirementCreeps(r.work);

        demand.carryHint += requirementParts(r.carry);
        demand.haulerCreeps += requirementCreeps(r.carry);
        demand.combat += requirementParts(r.combat);
        demand.defenderCreeps += requirementCreeps(r.combat);

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
    const miningBased = haulingFromMining(Math.max(supply.mine, demand.mine));
    const taskBased = demand.carryHint;

    return Math.ceil(miningBased * (1 - TASK_CARRY_WEIGHT) + taskBased * TASK_CARRY_WEIGHT);
}

function pressureScore(
    supplyParts: number,
    supplyCreeps: number,
    demandParts: number,
    demandCreeps: number,
    previousPressure: number,
    alpha: number
): number {
    const partPressure = demandParts <= 0 ? 0 : Math.max(0, demandParts - supplyParts) / demandParts;
    const creepPressure = demandCreeps <= 0 ? 0 : Math.max(0, demandCreeps - supplyCreeps) / demandCreeps;
    const instant = Math.max(partPressure, creepPressure);

    return previousPressure * (1 - alpha) + instant * alpha;
}

function immediatePressure(
    supplyParts: number,
    supplyCreeps: number,
    demandParts: number,
    demandCreeps: number
): number {
    const partPressure = demandParts <= 0 ? 0 : Math.max(0, demandParts - supplyParts) / demandParts;
    const creepPressure = demandCreeps <= 0 ? 0 : Math.max(0, demandCreeps - supplyCreeps) / demandCreeps;

    return Math.max(partPressure, creepPressure);
}

function statsSnapshot(
    previous: SpawnRoleSnapshot | undefined,
    supplyParts: number,
    supplyCreeps: number,
    demandParts: number,
    demandCreeps: number,
    idleCreeps: number,
    alpha: number
): SpawnRoleSnapshot {
    return {
        supplyParts,
        supplyCreeps,
        demandParts,
        demandCreeps,
        idleCreeps,
        pressure: pressureScore(
            supplyParts,
            supplyCreeps,
            demandParts,
            demandCreeps,
            previous?.pressure ?? 0,
            alpha
        )
    };
}

function updateSpawnStats(room: Room, supply: SupplyTotals, demand: DemandTotals, targetCarry: number): RoomSpawnStats {
    const previous = room.memory.spawnStats;

    const stats: RoomSpawnStats = {
        lastUpdated: Game.time,
        mine: statsSnapshot(
            previous?.mine,
            supply.mine,
            supply.minerCreeps,
            demand.mine,
            demand.minerCreeps,
            supply.idleMiners,
            PRESSURE_ALPHA
        ),
        carry: statsSnapshot(
            previous?.carry,
            supply.carry,
            supply.haulerCreeps,
            targetCarry,
            demand.haulerCreeps,
            supply.idleHaulers,
            PRESSURE_ALPHA
        ),
        work: statsSnapshot(
            previous?.work,
            supply.work,
            supply.workerCreeps,
            demand.work,
            demand.workerCreeps,
            supply.idleWorkers,
            PRESSURE_ALPHA
        ),
        scout: statsSnapshot(
            previous?.scout,
            supply.scout,
            supply.scout,
            demand.scout,
            demand.scout,
            supply.idleScouts,
            SCOUT_PRESSURE_ALPHA
        ),
        combat: statsSnapshot(
            previous?.combat,
            supply.combat,
            supply.defenderCreeps,
            demand.combat,
            demand.defenderCreeps,
            supply.idleDefenders,
            PRESSURE_ALPHA
        )
    };

    room.memory.spawnStats = stats;

    return stats;
}

function shouldSpawnForPressure(snapshot: SpawnRoleSnapshot): boolean {
    if (snapshot.demandParts <= 0 && snapshot.demandCreeps <= 0) {
        return false;
    }

    if (snapshot.idleCreeps > 0) {
        return false;
    }

    return snapshot.pressure >= PRESSURE_SPAWN_THRESHOLD;
}

/* ============================================================
   SPAWN DECISION
   ============================================================ */

function selectSpawnIntent(
    room: Room,
    supply: SupplyTotals,
    demand: DemandTotals,
    stats: RoomSpawnStats
): SpawnIntent | null {
    const targetCarry = stats.carry.demandParts;
    const minerImmediate = immediatePressure(supply.mine, supply.minerCreeps, demand.mine, demand.minerCreeps);
    const carryImmediate = immediatePressure(supply.carry, supply.haulerCreeps, targetCarry, demand.haulerCreeps);
    const workImmediate = immediatePressure(supply.work, supply.workerCreeps, demand.work, demand.workerCreeps);
    const combatImmediate = immediatePressure(
        supply.combat,
        supply.defenderCreeps,
        demand.combat,
        demand.defenderCreeps
    );

    if (demand.combat > 0 && supply.combat === 0) {
        return { kind: SpawnIntentKind.DEFENDER };
    }

    if (combatImmediate >= 1 && supply.idleDefenders === 0) {
        return { kind: SpawnIntentKind.DEFENDER };
    }

    if (supply.mine === 0 && demand.mine > 0) {
        return { kind: SpawnIntentKind.MINER };
    }

    if (supply.carry === 0 && targetCarry > 0) {
        return { kind: SpawnIntentKind.HAULER };
    }

    if (minerImmediate >= 1 && supply.idleMiners === 0) {
        return { kind: SpawnIntentKind.MINER };
    }

    if (carryImmediate >= 1 && supply.idleHaulers === 0) {
        return { kind: SpawnIntentKind.HAULER };
    }

    const roleCandidates: { kind: SpawnIntentKind; pressure: number }[] = [];

    if (shouldSpawnForPressure(stats.mine)) {
        roleCandidates.push({ kind: SpawnIntentKind.MINER, pressure: stats.mine.pressure });
    }

    if (shouldSpawnForPressure(stats.combat)) {
        roleCandidates.push({ kind: SpawnIntentKind.DEFENDER, pressure: stats.combat.pressure + 0.3 });
    }

    if (shouldSpawnForPressure(stats.carry)) {
        roleCandidates.push({ kind: SpawnIntentKind.HAULER, pressure: stats.carry.pressure });
    }

    if (demand.scout > 0 && supply.scout === 0) {
        return { kind: SpawnIntentKind.SCOUT };
    }

    if (shouldSpawnForPressure(stats.scout)) {
        roleCandidates.push({ kind: SpawnIntentKind.SCOUT, pressure: stats.scout.pressure });
    }

    if ((workImmediate > 0 || stats.work.pressure > 0) && shouldSpawnForPressure(stats.work)) {
        roleCandidates.push({ kind: SpawnIntentKind.WORKER, pressure: stats.work.pressure });
    }

    roleCandidates.sort((a, b) => b.pressure - a.pressure);

    if (roleCandidates.length > 0) {
        return roleCandidates[0].kind === SpawnIntentKind.HAULER
            ? { kind: SpawnIntentKind.HAULER }
            : roleCandidates[0].kind === SpawnIntentKind.MINER
              ? { kind: SpawnIntentKind.MINER }
              : roleCandidates[0].kind === SpawnIntentKind.SCOUT
                ? { kind: SpawnIntentKind.SCOUT }
                : roleCandidates[0].kind === SpawnIntentKind.DEFENDER
                  ? { kind: SpawnIntentKind.DEFENDER }
                  : { kind: SpawnIntentKind.WORKER };
    }

    if (workImmediate > 0 && supply.idleWorkers === 0) {
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
        const targetCarry = effectiveCarryDemand(supply, demand);
        const stats = updateSpawnStats(room, supply, demand, targetCarry);

        const intent = selectSpawnIntent(room, supply, demand, stats);
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
            case SpawnIntentKind.DEFENDER:
                body = defenderBody(energy);
                break;
        }

        if (!body || body.length === 0) return;

        spawn.spawnCreep(body, `${SpawnIntentKind[intent.kind]}-${Game.time}`, {
            memory: getDefaultCreepMemory(room.name)
        });
    }
}
