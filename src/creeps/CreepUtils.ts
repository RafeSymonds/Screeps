export function hasBodyPart(creep: Creep, bodyPart: BodyPartConstant): boolean {
    return creep.body.some(part => part.type === bodyPart);
}

export function countBodyParts(creep: Creep, bodyPart: BodyPartConstant): number {
    let count = 0;
    for (const part of creep.body) {
        if (part.type === bodyPart) {
            count++;
        }
    }

    return count;
}

export function countCombatParts(creep: Creep): number {
    return countBodyParts(creep, ATTACK) + countBodyParts(creep, RANGED_ATTACK) + countBodyParts(creep, HEAL);
}

export function hasCombatPart(creep: Creep): boolean {
    return countCombatParts(creep) > 0;
}

export function isDedicatedMinerCreep(creep: Creep): boolean {
    return (
        hasBodyPart(creep, WORK) &&
        countBodyParts(creep, CARRY) <= 1 &&
        !hasCombatPart(creep) &&
        !hasBodyPart(creep, CLAIM)
    );
}

export function isDedicatedHaulerCreep(creep: Creep): boolean {
    return (
        hasBodyPart(creep, CARRY) && !hasBodyPart(creep, WORK) && !hasCombatPart(creep) && !hasBodyPart(creep, CLAIM)
    );
}

export function isWorkerCreep(creep: Creep): boolean {
    return (
        hasBodyPart(creep, WORK) &&
        countBodyParts(creep, CARRY) > 1 &&
        !hasCombatPart(creep) &&
        !hasBodyPart(creep, CLAIM)
    );
}

export function creepEnergyCarryCapacity(creep: Creep): number {
    return countBodyParts(creep, CARRY) * 50;
}

export function creepEnergy(creep: Creep): number {
    return creep.store.getUsedCapacity(RESOURCE_ENERGY);
}
