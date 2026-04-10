import { CreepState } from "creeps/CreepState";
import { moveTo } from "creeps/CreepController";

export function harvest(creepState: CreepState, source: Source): ScreepsReturnCode | undefined {
    const creep = creepState.creep;
    const result = creep.harvest(source);

    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creepState, source);
        return undefined;
    }

    if (result === OK && creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        const link = creep.pos
            .findInRange(FIND_MY_STRUCTURES, 1)
            .find(
                (s): s is StructureLink =>
                    s.structureType === STRUCTURE_LINK && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            );

        if (link) {
            creep.transfer(link, RESOURCE_ENERGY);
            return undefined;
        }

        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
            const container = creep.pos
                .findInRange(FIND_STRUCTURES, 1)
                .find(
                    (s): s is StructureContainer =>
                        s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                );

            if (container) {
                creep.transfer(container, RESOURCE_ENERGY);
            } else {
                creep.drop(RESOURCE_ENERGY);
            }
        }
    }

    return result;
}

export function build(creepState: CreepState, target: ConstructionSite): ScreepsReturnCode | undefined {
    const creep = creepState.creep;
    const result = creep.build(target);

    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creepState, target);
        return undefined;
    }

    return result;
}

export function upgrade(creepState: CreepState, target: StructureController): ScreepsReturnCode | undefined {
    const creep = creepState.creep;
    const result = creep.upgradeController(target);

    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creepState, target);
        return undefined;
    }

    return result;
}

export function repair(creepState: CreepState, target: Structure): ScreepsReturnCode | undefined {
    const creep = creepState.creep;
    const result = creep.repair(target);

    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creepState, target);
        return undefined;
    }

    return result;
}

export function transfer(
    creepState: CreepState,
    target: AnyStoreStructure,
    resourceType: ResourceConstant = RESOURCE_ENERGY
): ScreepsReturnCode | undefined {
    const creep = creepState.creep;
    const result = creep.transfer(target, resourceType);

    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creepState, target);
        return undefined;
    }

    return result;
}

export function move(creepState: CreepState, target: RoomPosition | { pos: RoomPosition }): void {
    moveTo(creepState, target);
}

export function drop(creepState: CreepState, target: ResourceConstant, amount?: number): ScreepsReturnCode {
    const creep = creepState.creep;
    return amount !== undefined ? creep.drop(target, amount) : creep.drop(target);
}

export function pickup(creepState: CreepState, target: Resource): ScreepsReturnCode | undefined {
    const creep = creepState.creep;
    const result = creep.pickup(target);

    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creepState, target);
        return undefined;
    }

    return result;
}

export function claim(creepState: CreepState, target: StructureController): ScreepsReturnCode {
    const creep = creepState.creep;
    return creep.claimController(target);
}

export function reserve(creepState: CreepState, target: StructureController): ScreepsReturnCode {
    const creep = creepState.creep;
    return creep.reserveController(target);
}

export function attack(
    creepState: CreepState,
    target: AnyCreep | Structure<StructureConstant>
): ScreepsReturnCode | undefined {
    const creep = creepState.creep;
    const result = creep.attack(target);

    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creepState, target);
        return undefined;
    }

    return result;
}

export function rangedAttack(
    creepState: CreepState,
    target: AnyCreep | Structure<StructureConstant>
): ScreepsReturnCode | undefined {
    const creep = creepState.creep;
    const result = creep.rangedAttack(target);

    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creepState, target);
        return undefined;
    }

    return result;
}

export function heal(creepState: CreepState, target: AnyCreep): ScreepsReturnCode | undefined {
    const creep = creepState.creep;
    const result = creep.heal(target);

    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creepState, target);
        return undefined;
    }

    return result;
}

export function rangedHeal(creepState: CreepState, target: AnyCreep): ScreepsReturnCode {
    const creep = creepState.creep;
    return creep.rangedHeal(target);
}

export function bootstrap(creepState: CreepState, target: StructureSpawn): ScreepsReturnCode | undefined {
    const creep = creepState.creep;

    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        const result = creep.transfer(target, RESOURCE_ENERGY);

        if (result === ERR_NOT_IN_RANGE) {
            moveTo(creepState, target);
            return undefined;
        }

        return result;
    }

    return creep.harvest(target.pos.findClosestByRange(FIND_SOURCES) as Source) as ScreepsReturnCode | undefined;
}
