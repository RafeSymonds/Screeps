import { countCombatParts } from "creeps/CreepUtils";

function bodyParts(creep: Creep, part: BodyPartConstant): number {
    return creep.body.reduce((total, bodyPart) => total + (bodyPart.type === part ? 1 : 0), 0);
}

export function hostileThreat(hostile: Creep): number {
    return (
        bodyParts(hostile, ATTACK) * 2 +
        bodyParts(hostile, RANGED_ATTACK) * 3 +
        bodyParts(hostile, HEAL) * 4 +
        bodyParts(hostile, WORK) +
        bodyParts(hostile, CLAIM)
    );
}

export function roomThreat(hostiles: Creep[]): number {
    return hostiles.reduce((total, hostile) => total + hostileThreat(hostile), 0);
}

export function requestedDefenders(hostiles: Creep[]): number {
    const threat = roomThreat(hostiles);
    const healerCount = hostiles.filter(hostile => bodyParts(hostile, HEAL) > 0).length;

    return Math.max(1, Math.min(4, Math.ceil(threat / 8) + healerCount));
}

export function requestedCombatParts(hostiles: Creep[]): number {
    const threat = roomThreat(hostiles);
    const healPressure = hostiles.reduce((total, hostile) => total + bodyParts(hostile, HEAL), 0);

    return Math.max(2, threat + healPressure * 2);
}

export function findSafeAnchor(room: Room): RoomPosition {
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (spawn) {
        return spawn.pos;
    }

    if (room.controller) {
        return room.controller.pos;
    }

    return new RoomPosition(25, 25, room.name);
}

export function selectPriorityHostile(origin: RoomPosition, hostiles: Creep[]): Creep | null {
    if (hostiles.length === 0) {
        return null;
    }

    let best: Creep | null = null;
    let bestScore = -Infinity;

    for (const hostile of hostiles) {
        const range = origin.getRangeTo(hostile);
        const score = hostileThreat(hostile) * 20 - range * 3 - hostile.hits / 100;

        if (score > bestScore) {
            best = hostile;
            bestScore = score;
        }
    }

    return best;
}

export function weakestFriendly(creeps: Creep[]): Creep | null {
    let best: Creep | null = null;
    let bestMissing = 0;

    for (const creep of creeps) {
        const missing = creep.hitsMax - creep.hits;
        if (missing > bestMissing) {
            best = creep;
            bestMissing = missing;
        }
    }

    return best;
}

export function combatPower(creep: Creep): number {
    return countCombatParts(creep);
}
