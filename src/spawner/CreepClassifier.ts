import { CreepState } from "creeps/CreepState";
import { countBodyParts, countCombatParts, hasBodyPart, hasCombatPart } from "creeps/CreepUtils";
import { TaskKind } from "tasks/core/TaskKind";
import { SpawnRequestRole } from "memory/types";

export type CreepRole = SpawnRequestRole;

export interface CreepProfile {
    role: CreepRole;
    isExpiringSoon: boolean;
}

export function classifyCreep(cs: CreepState, role: SpawnRequestRole, creepSpawnTime: number): CreepProfile {
    return {
        role,
        isExpiringSoon: isExpiringSoon(cs.creep, role, creepSpawnTime)
    };
}

function isExpiringSoon(creep: Creep, role: SpawnRequestRole, spawnTime: number): boolean {
    if (creep.spawning || creep.ticksToLive === undefined) {
        return false;
    }

    const leadTime = replacementLeadTime(role, creep);
    return creep.ticksToLive <= leadTime;
}

function replacementLeadTime(role: SpawnRequestRole, creep: Creep): number {
    const spawnTime = creep.body.length * CREEP_SPAWN_TIME;
    const bias = creep.memory.lastTaskRoom && creep.memory.lastTaskRoom !== creep.memory.ownerRoom ? 25 : 0;
    const remoteBias = creep.memory.ownerRoom !== creep.room.name ? 15 : 0;

    switch (role) {
        case "miner":
            return spawnTime + 20 + bias;
        case "mineralHarvester":
            return spawnTime + 20 + bias;
        case "hauler":
            return spawnTime + 30 + bias + remoteBias;
        case "fastFiller":
            return spawnTime + 25 + bias;
        case "worker":
            return spawnTime + 20 + bias;
        case "scout":
            return spawnTime + 25 + bias;
        case "defender":
            return spawnTime + 15;
        case "attacker":
            return spawnTime + 50;
        case "reserver":
            return spawnTime + 40;
    }
}

export function isMiner(cs: CreepState): boolean {
    if (!hasBodyPart(cs.creep, WORK)) return false;
    const carryParts = countBodyParts(cs.creep, CARRY);
    return carryParts === 0;
}

export function isWorker(cs: CreepState): boolean {
    if (!hasBodyPart(cs.creep, WORK) || !hasBodyPart(cs.creep, CARRY)) return false;
    const carryParts = countBodyParts(cs.creep, CARRY);
    return carryParts >= 1;
}

export function isClaimer(cs: CreepState): boolean {
    return hasBodyPart(cs.creep, CLAIM);
}

export function isScout(cs: CreepState): boolean {
    return (
        hasBodyPart(cs.creep, MOVE) &&
        !hasBodyPart(cs.creep, WORK) &&
        !hasBodyPart(cs.creep, CARRY) &&
        !hasBodyPart(cs.creep, CLAIM)
    );
}

export function isCombat(cs: CreepState): boolean {
    return hasCombatPart(cs.creep);
}

export function isAttacker(cs: CreepState): boolean {
    return hasCombatPart(cs.creep) && cs.memory.lastTaskKind === TaskKind.ATTACK;
}

export function isHauler(cs: CreepState): boolean {
    const carryParts = countBodyParts(cs.creep, CARRY);
    return carryParts > 0 && !hasBodyPart(cs.creep, WORK);
}
