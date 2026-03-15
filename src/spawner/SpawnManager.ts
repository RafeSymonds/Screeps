import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { getDefaultCreepMemory } from "creeps/CreepMemory";
import { countBodyParts, countCombatParts, hasBodyPart, hasCombatPart } from "creeps/CreepUtils";
import { TaskRequirements, requirementCreeps, requirementParts } from "tasks/core/TaskRequirements";
import { CreepState } from "creeps/CreepState";
import { clearSpawnRequest, getActiveSpawnRequests, upsertSpawnRequest } from "./SpawnRequests";
import { TaskKind } from "tasks/core/TaskKind";

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
    DEFENDER,
    CLAIMER,
    ATTACKER
}

type SpawnIntent =
    | { kind: SpawnIntentKind.SCOUT }
    | { kind: SpawnIntentKind.MINER }
    | { kind: SpawnIntentKind.HAULER }
    | { kind: SpawnIntentKind.WORKER }
    | { kind: SpawnIntentKind.DEFENDER }
    | { kind: SpawnIntentKind.CLAIMER }
    | { kind: SpawnIntentKind.ATTACKER };

type ResolvedSpawnRequest = {
    kind: SpawnIntentKind;
    priority: number;
    unmetCreeps: number;
    minEnergy?: number;
};

/* ============================================================
   BODY BUILDERS
   ============================================================ */

function scoutBody(): BodyPartConstant[] {
    return [MOVE];
}

function minerBody(energy: number, room?: Room): BodyPartConstant[] {
    const rcl = room?.controller?.level ?? 0;
    const hasLinks = rcl >= 5 && (room?.find(FIND_MY_STRUCTURES).some(
        s => s.structureType === STRUCTURE_LINK
    ) ?? false);

    // If room has links, add 1 CARRY so miner can transfer to link
    if (hasLinks && energy >= 250) {
        const maxWork = Math.floor((energy - 100) / 100); // 50 MOVE + 50 CARRY + N*100 WORK
        const work = Math.max(1, maxWork);
        return [MOVE, CARRY, ...Array(work).fill(WORK)];
    }

    const maxWork = Math.floor((energy - 50) / 100);
    const work = Math.max(1, maxWork);
    return [MOVE, ...Array(work).fill(WORK)];
}

function desiredHaulerCarry(room: Room, routeLength?: number): number {
    const cap = room.energyCapacityAvailable;

    let base: number;
    if (cap < 550) base = 2;
    else if (cap < 800) base = 4;
    else if (cap < 1300) base = 6;
    else if (cap < 1800) base = 8;
    else if (cap < 2300) base = 12;
    else base = 16;

    if (routeLength && routeLength > 1) {
        // Longer routes need more CARRY to keep throughput up
        // Formula: carry = ceil(energyPerTick * roundTripTicks / carryCapacity)
        const energyPerTick = 10; // 2 sources * 5 WORK parts
        const roundTrip = routeLength * 50 * 2;
        const needed = Math.ceil((energyPerTick * roundTrip) / 50);
        base = Math.max(base, Math.min(needed, MAX_HAULER_CARRY));
    }

    return base;
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
    if (energy < 200) {
        return energy >= 130 ? [ATTACK, MOVE] : [];
    }

    const toughParts: BodyPartConstant[] = [];
    const combatParts: BodyPartConstant[] = [];
    const moveParts: BodyPartConstant[] = [];
    let remaining = energy;

    // Add TOUGH up front (cheap HP shields)
    while (remaining >= 210 && toughParts.length < 4 && toughParts.length + combatParts.length + moveParts.length < 48) {
        toughParts.push(TOUGH);
        moveParts.push(MOVE);
        remaining -= 60; // 10 + 50
    }

    // Add RANGED_ATTACK + MOVE pairs
    while (remaining >= 200 && toughParts.length + combatParts.length + moveParts.length <= 48) {
        combatParts.push(RANGED_ATTACK);
        moveParts.push(MOVE);
        remaining -= 200;
    }

    // Try to add a HEAL + MOVE if we have room and energy
    if (remaining >= 300 && toughParts.length + combatParts.length + moveParts.length <= 48) {
        combatParts.push(HEAL);
        moveParts.push(MOVE);
        remaining -= 300;
    }

    if (combatParts.length === 0) {
        return [RANGED_ATTACK, MOVE];
    }

    // Body order: TOUGH first (damaged first), combat middle, MOVE last (preserved longest)
    return [...toughParts, ...combatParts, ...moveParts];
}

function claimerBody(energy: number): BodyPartConstant[] {
    if (energy >= 1300) {
        return [CLAIM, CLAIM, MOVE, MOVE];
    }

    if (energy >= 650) {
        return [CLAIM, MOVE];
    }

    return [];
}

function attackerBody(energy: number): BodyPartConstant[] {
    if (energy < 800) return [];

    const toughParts: BodyPartConstant[] = [];
    const combatParts: BodyPartConstant[] = [];
    const moveParts: BodyPartConstant[] = [];
    let remaining = energy;

    // Add TOUGH + MOVE pairs (cheap HP)
    while (remaining >= 260 && toughParts.length < 3 && toughParts.length + combatParts.length + moveParts.length < 48) {
        toughParts.push(TOUGH);
        moveParts.push(MOVE);
        remaining -= 60;
    }

    // Add RANGED_ATTACK + MOVE pairs
    while (remaining >= 350 && toughParts.length + combatParts.length + moveParts.length <= 46) {
        combatParts.push(RANGED_ATTACK);
        moveParts.push(MOVE);
        remaining -= 200;
    }

    // Add HEAL + MOVE if affordable
    while (remaining >= 300 && toughParts.length + combatParts.length + moveParts.length <= 48) {
        combatParts.push(HEAL);
        moveParts.push(MOVE);
        remaining -= 300;
    }

    if (combatParts.length === 0) return [RANGED_ATTACK, MOVE];

    return [...toughParts, ...combatParts, ...moveParts];
}

/* ============================================================
   CREEP CLASSIFICATION
   ============================================================ */

function isMiner(cs: CreepState): boolean {
    if (!hasBodyPart(cs.creep, WORK)) return false;

    // Pure miners have no CARRY; link miners have 1 CARRY with many WORK
    const carryParts = countBodyParts(cs.creep, CARRY);
    const workParts = countBodyParts(cs.creep, WORK);

    return carryParts === 0 || (carryParts === 1 && workParts >= 3);
}

function isWorker(cs: CreepState): boolean {
    if (!hasBodyPart(cs.creep, WORK) || !hasBodyPart(cs.creep, CARRY)) return false;

    // Workers have roughly balanced WORK/CARRY; miners have 1 CARRY with 3+ WORK
    const carryParts = countBodyParts(cs.creep, CARRY);
    const workParts = countBodyParts(cs.creep, WORK);

    return carryParts > 1 || workParts < 3;
}

function isClaimer(cs: CreepState): boolean {
    return hasBodyPart(cs.creep, CLAIM);
}

function isScout(cs: CreepState): boolean {
    return hasBodyPart(cs.creep, MOVE) && !hasBodyPart(cs.creep, WORK) && !hasBodyPart(cs.creep, CARRY) && !hasBodyPart(cs.creep, CLAIM);
}

function isCombat(cs: CreepState): boolean {
    return hasCombatPart(cs.creep);
}

function isAttacker(cs: CreepState): boolean {
    return hasCombatPart(cs.creep) && cs.memory.lastTaskKind === TaskKind.ATTACK;
}

function replacementLeadTime(role: SpawnRequestRole, creep: Creep): number {
    const spawnTime = creep.body.length * CREEP_SPAWN_TIME;
    const taskRoomBias = creep.memory.lastTaskRoom && creep.memory.lastTaskRoom !== creep.memory.ownerRoom ? 25 : 0;
    const remoteBias = creep.memory.ownerRoom !== creep.room.name ? 15 : 0;

    switch (role) {
        case "miner":
            return spawnTime + 20 + taskRoomBias;
        case "hauler":
            return spawnTime + 30 + taskRoomBias + remoteBias;
        case "worker":
            return spawnTime + 20 + taskRoomBias;
        case "scout":
            return spawnTime + 25 + taskRoomBias;
        case "defender":
            return spawnTime + 15;
        case "attacker":
            return spawnTime + 50;
        case "reserver":
            return spawnTime + 40;
    }
}

function isExpiringSoon(creep: Creep, role: SpawnRequestRole): boolean {
    if (creep.spawning || creep.ticksToLive === undefined) {
        return false;
    }

    return creep.ticksToLive <= replacementLeadTime(role, creep);
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
    attackCombat: number;
    attackerCreeps: number;
    idleAttackers: number;
    incomingMiners: number;
    incomingHaulers: number;
    incomingWorkers: number;
    incomingScouts: number;
    incomingDefenders: number;
    incomingAttackers: number;
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
        idleDefenders: 0,
        attackCombat: 0,
        attackerCreeps: 0,
        idleAttackers: 0,
        incomingMiners: 0,
        incomingHaulers: 0,
        incomingWorkers: 0,
        incomingScouts: 0,
        incomingDefenders: 0,
        incomingAttackers: 0
    };

    for (const cs of worldRoom.myCreeps) {
        if (cs.creep.spawning) {
            if (isClaimer(cs)) {
                supply.incomingScouts += 1; // claimers counted with scouts
            } else if (isAttacker(cs)) {
                supply.incomingAttackers += 1;
            } else if (isCombat(cs)) {
                supply.incomingDefenders += 1;
            } else if (isMiner(cs)) {
                supply.incomingMiners += 1;
            } else if (isWorker(cs)) {
                supply.incomingWorkers += 1;
            } else if (isScout(cs)) {
                supply.incomingScouts += 1;
            } else if (countBodyParts(cs.creep, CARRY) > 0) {
                supply.incomingHaulers += 1;
            }
            continue;
        }

        const idle = cs.memory.taskId === undefined;

        if (isAttacker(cs)) {
            supply.attackCombat += countCombatParts(cs.creep);
            supply.attackerCreeps += 1;
            if (idle) supply.idleAttackers += 1;
        } else if (isCombat(cs)) {
            if (!isExpiringSoon(cs.creep, "defender")) {
                supply.combat += countCombatParts(cs.creep);
                supply.defenderCreeps += 1;
            }
            if (idle) {
                supply.idleDefenders += 1;
            }
        } else if (isMiner(cs)) {
            if (!isExpiringSoon(cs.creep, "miner")) {
                supply.mine += countBodyParts(cs.creep, WORK);
                supply.minerCreeps += 1;
            }
            if (idle) {
                supply.idleMiners += 1;
            }
        } else if (isWorker(cs)) {
            if (!isExpiringSoon(cs.creep, "worker")) {
                supply.work += countBodyParts(cs.creep, WORK);
                supply.workerCreeps += 1;
                supply.carry += countBodyParts(cs.creep, CARRY);
            }
            if (idle) {
                supply.idleWorkers += 1;
            }
        } else if (isScout(cs)) {
            if (!isExpiringSoon(cs.creep, "scout")) {
                supply.scout += 1;
            }
            if (idle) {
                supply.idleScouts += 1;
            }
        } else {
            const carryParts = countBodyParts(cs.creep, CARRY);
            if (carryParts > 0 && !isExpiringSoon(cs.creep, "hauler")) {
                supply.carry += carryParts;
                supply.haulerCreeps += 1;
            }
            if (carryParts > 0) {
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
        ),
        attack: statsSnapshot(
            previous?.attack,
            supply.attackCombat,
            supply.attackerCreeps,
            0,
            0,
            supply.idleAttackers,
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

function spawnIntentFromRole(role: SpawnRequestRole): SpawnIntentKind {
    switch (role) {
        case "scout":
            return SpawnIntentKind.SCOUT;
        case "miner":
            return SpawnIntentKind.MINER;
        case "hauler":
            return SpawnIntentKind.HAULER;
        case "worker":
            return SpawnIntentKind.WORKER;
        case "defender":
            return SpawnIntentKind.DEFENDER;
        case "attacker":
            return SpawnIntentKind.ATTACKER;
        case "reserver":
            return SpawnIntentKind.CLAIMER;
    }
}

function currentCreepsForRole(role: SpawnRequestRole, supply: SupplyTotals): number {
    switch (role) {
        case "scout":
            return supply.scout + supply.incomingScouts;
        case "miner":
            return supply.minerCreeps + supply.incomingMiners;
        case "hauler":
            return supply.haulerCreeps + supply.incomingHaulers;
        case "worker":
            return supply.workerCreeps + supply.incomingWorkers;
        case "defender":
            return supply.defenderCreeps + supply.incomingDefenders;
        case "attacker":
            return supply.attackerCreeps + supply.incomingAttackers;
        case "reserver":
            return supply.scout + supply.incomingScouts; // claimers counted with scouts
    }
}

function explicitSpawnRequests(room: Room, supply: SupplyTotals): ResolvedSpawnRequest[] {
    return getActiveSpawnRequests(room)
        .map(request => ({
            request,
            unmetCreeps: Math.max(0, request.desiredCreeps - currentCreepsForRole(request.role, supply))
        }))
        .filter(({ unmetCreeps }) => unmetCreeps > 0)
        .map(({ request, unmetCreeps }) => ({
            kind: spawnIntentFromRole(request.role),
            priority: request.priority,
            unmetCreeps,
            minEnergy: request.minEnergy
        }));
}

function roleRequestKey(role: Exclude<SpawnRequestRole, "defender">, roomName: string): string {
    return `baseline:${role}:${roomName}`;
}

function rolePriorityBoost(room: Room, role: SpawnRequestRole): number {
    const onboarding = room.memory.onboarding;
    const support = room.memory.supportRequest;
    let boost = 0;

    if (role === "miner" && onboarding?.needsMiner) {
        boost += 40;
    }

    if (role === "hauler" && onboarding?.needsHauler) {
        boost += 35;
    }

    if (role === "worker" && onboarding?.needsBuilder) {
        boost += 20;
    }

    if (support?.kind === "bootstrap" && (role === "miner" || role === "hauler" || role === "worker")) {
        boost += 25;
    }

    if (support?.kind === "economy" && (role === "miner" || role === "hauler")) {
        boost += 20;
    }

    if (support?.kind === "build" && role === "worker") {
        boost += 15;
    }

    return boost;
}

function refreshBaselineSpawnRequests(room: Room, supply: SupplyTotals, demand: DemandTotals, stats: RoomSpawnStats): void {
    const targetCarry = stats.carry.demandParts;
    const minerImmediate = immediatePressure(supply.mine, supply.minerCreeps, demand.mine, demand.minerCreeps);
    const carryImmediate = immediatePressure(supply.carry, supply.haulerCreeps, targetCarry, demand.haulerCreeps);
    const workImmediate = immediatePressure(supply.work, supply.workerCreeps, demand.work, demand.workerCreeps);
    const scoutImmediate = immediatePressure(supply.scout, supply.scout, demand.scout, demand.scout);

    const minerPriority =
        supply.mine === 0 && demand.mine > 0
            ? 220
            : minerImmediate >= 1 && supply.idleMiners === 0
              ? 180
              : shouldSpawnForPressure(stats.mine)
                ? 80 + stats.mine.pressure * 100
                : 0;

    if (minerPriority > 0) {
        upsertSpawnRequest(room, {
            role: "miner",
            priority: minerPriority + rolePriorityBoost(room, "miner"),
            desiredCreeps: Math.max(1, demand.minerCreeps),
            expiresAt: Game.time + 2,
            requestedBy: roleRequestKey("miner", room.name),
            minEnergy: 150
        });
    } else {
        clearSpawnRequest(room, "miner", roleRequestKey("miner", room.name));
    }

    const haulerPriority =
        supply.carry === 0 && targetCarry > 0
            ? 210
            : carryImmediate >= 1 && supply.idleHaulers === 0
              ? 170
              : shouldSpawnForPressure(stats.carry)
                ? 75 + stats.carry.pressure * 100
                : 0;

    if (haulerPriority > 0) {
        upsertSpawnRequest(room, {
            role: "hauler",
            priority: haulerPriority + rolePriorityBoost(room, "hauler"),
            desiredCreeps: Math.max(1, demand.haulerCreeps),
            expiresAt: Game.time + 2,
            requestedBy: roleRequestKey("hauler", room.name),
            minEnergy: 200
        });
    } else {
        clearSpawnRequest(room, "hauler", roleRequestKey("hauler", room.name));
    }

    const scoutPriority =
        demand.scout > 0 && supply.scout === 0
            ? 120
            : scoutImmediate > 0 && shouldSpawnForPressure(stats.scout)
              ? 70 + stats.scout.pressure * 100
              : 0;

    if (scoutPriority > 0) {
        upsertSpawnRequest(room, {
            role: "scout",
            priority: scoutPriority,
            desiredCreeps: Math.max(1, demand.scout),
            expiresAt: Game.time + 2,
            requestedBy: roleRequestKey("scout", room.name),
            minEnergy: 50
        });
    } else {
        clearSpawnRequest(room, "scout", roleRequestKey("scout", room.name));
    }

    const workerPriority =
        workImmediate > 0 && supply.idleWorkers === 0
            ? 90 + workImmediate * 100
            : (workImmediate > 0 || stats.work.pressure > 0) && shouldSpawnForPressure(stats.work)
              ? 65 + stats.work.pressure * 100
              : 0;

    if (workerPriority > 0) {
        upsertSpawnRequest(room, {
            role: "worker",
            priority: workerPriority + rolePriorityBoost(room, "worker"),
            desiredCreeps: Math.max(1, demand.workerCreeps),
            expiresAt: Game.time + 2,
            requestedBy: roleRequestKey("worker", room.name),
            minEnergy: 200
        });
    } else {
        clearSpawnRequest(room, "worker", roleRequestKey("worker", room.name));
    }
}

/* ============================================================
   SPAWN DECISION
   ============================================================ */

function selectSpawnIntent(
    room: Room,
    supply: SupplyTotals,
    availableEnergy: number
): SpawnIntent | null {
    const requests = explicitSpawnRequests(room, supply)
        .filter(request => request.minEnergy === undefined || availableEnergy >= request.minEnergy)
        .sort((a, b) => {
            if (b.priority !== a.priority) {
                return b.priority - a.priority;
            }

            return b.unmetCreeps - a.unmetCreeps;
        });

    if (requests.length > 0) {
        return { kind: requests[0].kind };
    }

    return null;
}

function incrementIncomingSupply(supply: SupplyTotals, kind: SpawnIntentKind): void {
    switch (kind) {
        case SpawnIntentKind.SCOUT: supply.incomingScouts += 1; break;
        case SpawnIntentKind.MINER: supply.incomingMiners += 1; break;
        case SpawnIntentKind.HAULER: supply.incomingHaulers += 1; break;
        case SpawnIntentKind.WORKER: supply.incomingWorkers += 1; break;
        case SpawnIntentKind.DEFENDER: supply.incomingDefenders += 1; break;
        case SpawnIntentKind.CLAIMER: supply.incomingScouts += 1; break;
        case SpawnIntentKind.ATTACKER: supply.incomingAttackers += 1; break;
    }
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
        const spawns = room.find(FIND_MY_SPAWNS);
        if (spawns.length === 0) return;

        const supply = deriveSupply(worldRoom);
        const tasks = world.taskManager.getTasksForRoom(room);
        const demand = deriveDemand(tasks);
        const targetCarry = effectiveCarryDemand(supply, demand);
        const stats = updateSpawnStats(room, supply, demand, targetCarry);
        refreshBaselineSpawnRequests(room, supply, demand, stats);
        const energy = room.energyAvailable;

        for (const spawn of spawns) {
            if (spawn.spawning) continue;

            const intent = selectSpawnIntent(room, supply, energy);
            if (!intent) continue;

            let body: BodyPartConstant[] | null = null;

            switch (intent.kind) {
                case SpawnIntentKind.SCOUT:
                    body = scoutBody();
                    break;
                case SpawnIntentKind.MINER:
                    body = minerBody(energy, room);
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
                case SpawnIntentKind.CLAIMER:
                    body = claimerBody(energy);
                    break;
                case SpawnIntentKind.ATTACKER:
                    body = attackerBody(energy);
                    break;
            }

            if (!body || body.length === 0) continue;

            const result = spawn.spawnCreep(body, `${SpawnIntentKind[intent.kind]}-${spawn.name}-${Game.time}`, {
                memory: getDefaultCreepMemory(room.name)
            });

            if (result === OK) {
                incrementIncomingSupply(supply, intent.kind);
            }
        }
    }
}
