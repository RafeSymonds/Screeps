export function hasBodyPart(creep: Creep, bodyPart: BodyPartConstant): boolean {
    return creep.body.some(part => part.type === bodyPart);
}
