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

export function creepEnergyCarryCapacity(creep: Creep): number {
    return countBodyParts(creep, CARRY) * 50;
}

export function creepEnergy(creep: Creep): number {
    return creep.store.getUsedCapacity(RESOURCE_ENERGY);
}
