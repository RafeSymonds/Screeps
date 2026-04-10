import { TaskRequirements, requirementCreeps, requirementParts } from "tasks/core/TaskRequirements";
import { AnyTask } from "tasks/definitions/Task";
import { RoomGrowthStage, SpawnRoleSnapshot } from "memory/types";

export interface SupplySnapshot {
    mine: number;
    minerCreeps: number;
    idleMiners: number;
    carry: number;
    haulerCreeps: number;
    idleHaulers: number;
    work: number;
    workerCreeps: number;
    idleWorkers: number;
    scout: number;
    idleScouts: number;
    combat: number;
    defenderCreeps: number;
    idleDefenders: number;
    attackCombat: number;
    attackerCreeps: number;
    idleAttackers: number;
}

export interface DemandSnapshot {
    mine: number;
    minerCreeps: number;
    work: number;
    workerCreeps: number;
    carryHint: number;
    haulerCreeps: number;
    scout: number;
    combat: number;
    defenderCreeps: number;
}

export interface HaulerDemand {
    parts: number;
    creeps: number;
}

export interface PressureSnapshot {
    mine: SpawnRoleSnapshot;
    carry: SpawnRoleSnapshot;
    work: SpawnRoleSnapshot;
    scout: SpawnRoleSnapshot;
    combat: SpawnRoleSnapshot;
    attack: SpawnRoleSnapshot;
}

const PRESSURE_ALPHA = 0.35;
const SCOUT_PRESSURE_ALPHA = 0.5;
const ENERGY_PER_WORK_PER_TICK = 2.2;
const CARRY_CAPACITY = 50;
const HAUL_TICKS_PER_TRIP_BASE = 60;
const HAUL_TICKS_PER_TRIP_INFRA = 30;
const TASK_CARRY_WEIGHT = 0.35;

const SPAWN_WORK_CAP: Record<RoomGrowthStage, { maxWorkParts: number; maxWorkerCreeps: number }> = {
    bootstrap: { maxWorkParts: 14, maxWorkerCreeps: 5 },
    stabilizing: { maxWorkParts: 26, maxWorkerCreeps: 8 },
    remote: { maxWorkParts: 52, maxWorkerCreeps: 12 },
    surplus: { maxWorkParts: 100, maxWorkerCreeps: 25 }
};

export function deriveDemand(tasks: { requirements(): TaskRequirements }[]): DemandSnapshot {
    const demand: DemandSnapshot = {
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
        demand.workerCreeps += Math.max(requirementCreeps(r.work), Math.ceil(requirementParts(r.work) / 5));

        demand.carryHint += requirementParts(r.carry);
        demand.haulerCreeps += requirementCreeps(r.carry);
        demand.combat += requirementParts(r.combat);
        demand.defenderCreeps += requirementCreeps(r.combat);

        if (r.vision) {
            demand.scout = 1;
        }
    }

    return demand;
}

export function clampWorkerSpawnDemand(
    room: Room,
    supply: SupplySnapshot,
    raw: DemandSnapshot,
    tasks: unknown[]
): DemandSnapshot {
    const stage = room.memory.growth?.stage ?? "bootstrap";
    const cap = SPAWN_WORK_CAP[stage] ?? SPAWN_WORK_CAP.bootstrap;

    let workTasks = 0;
    let upgradeDesired = 0;
    for (const t of tasks) {
        const kind = (t as { data?: { kind?: string } })?.data?.kind;
        if (kind === "BUILD" || kind === "UPGRADE" || kind === "REPAIR") {
            workTasks += 1;
        }
        if (kind === "UPGRADE") {
            const d = (t as { data?: { desiredParts?: number } })?.data;
            upgradeDesired = Math.max(upgradeDesired, d?.desiredParts ?? 20);
        }
    }

    const upgradeAllow = Math.min(upgradeDesired, stage === "surplus" ? 100 : stage === "remote" ? 50 : 25);
    const taskMinCreeps = Math.min(cap.maxWorkerCreeps, workTasks);

    let work = Math.min(raw.work, cap.maxWorkParts);
    let workerCreeps = Math.max(taskMinCreeps, Math.min(raw.workerCreeps, cap.maxWorkerCreeps));

    if (supply.idleWorkers >= 2) {
        work = Math.min(work, supply.work);
        workerCreeps = 0;
    }

    return { ...raw, work, workerCreeps };
}

export function haulingFromMining(room: Room, supplyMine: number): number {
    const energyPerTick = supplyMine * ENERGY_PER_WORK_PER_TICK;

    const hasInfra =
        (room.storage !== undefined && room.storage.my) ||
        room.find(FIND_STRUCTURES).some(s => s.structureType === STRUCTURE_CONTAINER);

    const tripTime = hasInfra ? HAUL_TICKS_PER_TRIP_INFRA : HAUL_TICKS_PER_TRIP_BASE;
    const energyPerTrip = energyPerTick * tripTime;
    return Math.ceil(energyPerTrip / CARRY_CAPACITY);
}

export function effectiveCarryDemand(room: Room, supply: SupplySnapshot, demand: DemandSnapshot): HaulerDemand {
    const miningParts = haulingFromMining(room, Math.max(supply.mine, demand.mine));
    const taskParts = demand.carryHint;

    const parts = Math.ceil(miningParts * (1 - TASK_CARRY_WEIGHT) + taskParts * TASK_CARRY_WEIGHT);

    const sourceCount = room.find(FIND_SOURCES).length;
    const minCreeps = supply.mine > 0 ? sourceCount : 0;
    const carryPerHauler = (() => {
        const cap = room.energyCapacityAvailable;
        if (cap < 550) return 2;
        if (cap < 800) return 4;
        if (cap < 1300) return 6;
        if (cap < 1800) return 8;
        if (cap < 2300) return 12;
        return 16;
    })();

    const partsBasedCreeps = Math.min(Math.ceil(parts / carryPerHauler), Math.ceil(parts * 0.5));
    const creeps = Math.min(3, Math.max(minCreeps, partsBasedCreeps, demand.haulerCreeps));

    return { parts, creeps };
}

export function pressureScore(
    supplyParts: number,
    supplyCreeps: number,
    demandParts: number,
    demandCreeps: number,
    previousPressure: number,
    alpha: number
): number {
    const partPressure = demandParts <= 0 ? 0 : Math.max(0, demandParts - supplyParts) / demandParts;
    const creepPressure = demandCreeps <= 0 ? 0 : Math.max(0, demandCreeps - supplyCreeps) / demandCreeps;

    const instant = Math.min(1.5, partPressure + creepPressure);
    return previousPressure * (1 - alpha) + instant * alpha;
}

export function immediatePressure(
    supplyParts: number,
    supplyCreeps: number,
    demandParts: number,
    demandCreeps: number
): number {
    const partPressure = demandParts <= 0 ? 0 : Math.max(0, demandParts - supplyParts) / demandParts;
    const creepPressure = demandCreeps <= 0 ? 0 : Math.max(0, demandCreeps - supplyCreeps) / demandCreeps;

    return Math.min(1.5, partPressure + creepPressure);
}

export function updateSpawnStats(
    room: Room,
    supply: SupplySnapshot,
    demand: DemandSnapshot,
    haulerDemand: HaulerDemand,
    previous: PressureSnapshot | undefined
): PressureSnapshot {
    const stats: PressureSnapshot = {
        mine: {
            supplyParts: supply.mine,
            supplyCreeps: supply.minerCreeps,
            demandParts: demand.mine,
            demandCreeps: demand.minerCreeps,
            idleCreeps: supply.idleMiners,
            pressure: pressureScore(
                supply.mine,
                supply.minerCreeps,
                demand.mine,
                demand.minerCreeps,
                previous?.mine.pressure ?? 0,
                PRESSURE_ALPHA
            )
        },
        carry: {
            supplyParts: supply.carry,
            supplyCreeps: supply.haulerCreeps,
            demandParts: haulerDemand.parts,
            demandCreeps: haulerDemand.creeps,
            idleCreeps: supply.idleHaulers,
            pressure: pressureScore(
                supply.carry,
                supply.haulerCreeps,
                haulerDemand.parts,
                haulerDemand.creeps,
                previous?.carry.pressure ?? 0,
                PRESSURE_ALPHA
            )
        },
        work: {
            supplyParts: supply.work,
            supplyCreeps: supply.workerCreeps,
            demandParts: demand.work,
            demandCreeps: demand.workerCreeps,
            idleCreeps: supply.idleWorkers,
            pressure: pressureScore(
                supply.work,
                supply.workerCreeps,
                demand.work,
                demand.workerCreeps,
                previous?.work.pressure ?? 0,
                PRESSURE_ALPHA
            )
        },
        scout: {
            supplyParts: supply.scout,
            supplyCreeps: supply.scout,
            demandParts: demand.scout,
            demandCreeps: demand.scout,
            idleCreeps: supply.idleScouts,
            pressure: pressureScore(
                supply.scout,
                supply.scout,
                demand.scout,
                demand.scout,
                previous?.scout.pressure ?? 0,
                SCOUT_PRESSURE_ALPHA
            )
        },
        combat: {
            supplyParts: supply.combat,
            supplyCreeps: supply.defenderCreeps,
            demandParts: demand.combat,
            demandCreeps: demand.defenderCreeps,
            idleCreeps: supply.idleDefenders,
            pressure: pressureScore(
                supply.combat,
                supply.defenderCreeps,
                demand.combat,
                demand.defenderCreeps,
                previous?.combat.pressure ?? 0,
                PRESSURE_ALPHA
            )
        },
        attack: {
            supplyParts: supply.attackCombat,
            supplyCreeps: supply.attackerCreeps,
            demandParts: 0,
            demandCreeps: 0,
            idleCreeps: supply.idleAttackers,
            pressure: pressureScore(
                supply.attackCombat,
                supply.attackerCreeps,
                0,
                0,
                previous?.attack.pressure ?? 0,
                PRESSURE_ALPHA
            )
        }
    };

    return stats;
}
