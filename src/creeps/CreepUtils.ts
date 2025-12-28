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
