import { BODY_MAX_PARTS } from "config/constants";
import { SpawnRole } from "spawn/types";

export function bodyCost(body: BodyPartConstant[]): number {
    return body.reduce((sum, part) => sum + BODYPART_COST[part], 0);
}

/** Repeat a body pattern as many times as energy and the 50-part cap allow. */
export function repeatBody(pattern: BodyPartConstant[], energy: number, maxParts: number = BODY_MAX_PARTS): BodyPartConstant[] {
    const patternCost = bodyCost(pattern);
    const maxRepeats = Math.floor(maxParts / pattern.length);
    const repeats = Math.max(1, Math.min(Math.floor(energy / patternCost), maxRepeats));
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < repeats; i++) {
        body.push(...pattern);
    }
    return body;
}

/**
 * Reserver body: 1–2 CLAIM+MOVE pairs scaled to energy. One CLAIM only holds a
 * reservation steady (reserve 1/tick vs 1/tick decay); two CLAIM grow it toward the
 * 5000 cap so the reserver can build a buffer and die without the room un-reserving.
 * Capped at 2 — more CLAIM is wasted (the cap is reached quickly).
 */
function claimerBody(energy: number): BodyPartConstant[] {
    const pairCost = BODYPART_COST[CLAIM] + BODYPART_COST[MOVE];
    const pairs = Math.max(1, Math.min(2, Math.floor(energy / pairCost)));
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < pairs; i++) {
        body.push(CLAIM, MOVE);
    }
    return body;
}

/** Static-mining body: up to 5 WORK plus a MOVE, scaled to available energy. */
function minerBody(energy: number): BodyPartConstant[] {
    const workParts = Math.min(5, Math.max(1, Math.floor((energy - BODYPART_COST[MOVE]) / BODYPART_COST[WORK])));
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < workParts; i++) {
        body.push(WORK);
    }
    body.push(MOVE);
    return body;
}

/** Build a body for a spawn role sized to the energy budget. */
export function buildBody(role: SpawnRole, energy: number): BodyPartConstant[] {
    switch (role) {
        case SpawnRole.Miner:
            return minerBody(energy);
        case SpawnRole.Hauler:
            return repeatBody([CARRY, MOVE], energy);
        case SpawnRole.Defender:
            return repeatBody([TOUGH, ATTACK, MOVE], energy);
        case SpawnRole.Soldier:
            return repeatBody([ATTACK, MOVE], energy);
        case SpawnRole.Claimer:
            return claimerBody(energy);
        case SpawnRole.Scout:
            return [MOVE];
        case SpawnRole.Worker:
        default:
            return repeatBody([WORK, CARRY, MOVE], energy);
    }
}
