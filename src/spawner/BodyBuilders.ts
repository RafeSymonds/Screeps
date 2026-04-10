export interface BodyBuildResult {
    body: BodyPartConstant[];
    cost: number;
}

export function buildScout(energy: number): BodyBuildResult {
    if (energy < 50) return { body: [], cost: 0 };
    return { body: [MOVE], cost: 50 };
}

export function buildMiner(energy: number, room?: Room): BodyBuildResult {
    if (energy < 150) return { body: [], cost: 0 };

    const cap = room?.energyCapacityAvailable ?? 300;
    const budget = cap < 550 ? Math.min(energy, cap - 100) : energy;

    const maxWork = Math.floor((budget - 50) / 100);
    const work = Math.max(1, maxWork);
    const workParts: BodyPartConstant[] = [];
    for (let i = 0; i < work; i++) {
        workParts.push(WORK);
    }
    const body: BodyPartConstant[] = [MOVE, ...workParts];
    const cost = 50 + work * 100;

    return { body, cost };
}

export function buildHauler(energy: number, room: Room, routeLength?: number): BodyBuildResult {
    if (energy < 100) return { body: [], cost: 0 };

    const cap = room.energyCapacityAvailable;
    let base: number;
    if (cap < 550) base = 2;
    else if (cap < 800) base = 4;
    else if (cap < 1300) base = 6;
    else if (cap < 1800) base = 8;
    else if (cap < 2300) base = 12;
    else base = 16;

    if (routeLength && routeLength > 1) {
        const energyPerTick = 10;
        const roundTrip = routeLength * 50 * 2;
        const needed = Math.ceil((energyPerTick * roundTrip) / 50);
        base = Math.max(base, Math.min(needed, 16));
    }

    const maxFromEnergy = Math.floor(energy / 100);
    const carry = Math.max(1, Math.min(base, maxFromEnergy, 16));

    const body: BodyPartConstant[] = [];
    for (let i = 0; i < carry; i++) {
        body.push(CARRY, MOVE);
    }

    return { body, cost: carry * 100 };
}

export function buildWorker(energy: number): BodyBuildResult {
    if (energy < 250) return { body: [], cost: 0 };

    const units = Math.floor(energy / 200);
    const body: BodyPartConstant[] = [];
    for (let i = 0; i < units; i++) {
        body.push(WORK, CARRY, MOVE);
    }

    return { body, cost: units * 200 };
}

export function buildDefender(energy: number): BodyBuildResult {
    if (energy < 200) {
        return energy >= 130 ? { body: [ATTACK, MOVE], cost: 130 } : { body: [], cost: 0 };
    }

    const toughParts: BodyPartConstant[] = [];
    const combatParts: BodyPartConstant[] = [];
    const moveParts: BodyPartConstant[] = [];
    let remaining = energy;

    while (
        remaining >= 210 &&
        toughParts.length < 4 &&
        toughParts.length + combatParts.length + moveParts.length < 48
    ) {
        toughParts.push(TOUGH);
        moveParts.push(MOVE);
        remaining -= 60;
    }

    while (remaining >= 200 && toughParts.length + combatParts.length + moveParts.length <= 48) {
        combatParts.push(RANGED_ATTACK);
        moveParts.push(MOVE);
        remaining -= 200;
    }

    if (remaining >= 300 && toughParts.length + combatParts.length + moveParts.length <= 48) {
        combatParts.push(HEAL);
        moveParts.push(MOVE);
        remaining -= 300;
    }

    if (combatParts.length === 0) {
        return { body: [RANGED_ATTACK, MOVE], cost: 200 };
    }

    return { body: [...toughParts, ...combatParts, ...moveParts], cost: energy - remaining };
}

export function buildClaimer(energy: number): BodyBuildResult {
    if (energy >= 1300) {
        return { body: [CLAIM, CLAIM, MOVE, MOVE], cost: 1300 };
    }

    if (energy >= 650) {
        return { body: [CLAIM, MOVE], cost: 650 };
    }

    return { body: [], cost: 0 };
}

export function buildAttacker(energy: number): BodyBuildResult {
    if (energy < 800) return { body: [], cost: 0 };

    const toughParts: BodyPartConstant[] = [];
    const combatParts: BodyPartConstant[] = [];
    const moveParts: BodyPartConstant[] = [];
    let remaining = energy;

    while (
        remaining >= 260 &&
        toughParts.length < 3 &&
        toughParts.length + combatParts.length + moveParts.length < 48
    ) {
        toughParts.push(TOUGH);
        moveParts.push(MOVE);
        remaining -= 60;
    }

    while (remaining >= 350 && toughParts.length + combatParts.length + moveParts.length <= 46) {
        combatParts.push(RANGED_ATTACK);
        moveParts.push(MOVE);
        remaining -= 200;
    }

    while (remaining >= 300 && toughParts.length + combatParts.length + moveParts.length <= 48) {
        combatParts.push(HEAL);
        moveParts.push(MOVE);
        remaining -= 300;
    }

    if (combatParts.length === 0) {
        return { body: [RANGED_ATTACK, MOVE], cost: 200 };
    }

    return { body: [...toughParts, ...combatParts, ...moveParts], cost: energy - remaining };
}
