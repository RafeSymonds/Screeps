/**
 * Atomic creep intents. Each wraps the universal "move into range, then act"
 * pattern and is reusable across executors and (later) chained tasks. Keeping
 * these pure and tiny is what lets higher layers stay declarative.
 */

const MOVE_OPTS: MoveToOpts = { reusePath: 10, visualizePathStyle: { stroke: "#ffffff", opacity: 0.15 } };

export function moveTo(creep: Creep, target: RoomPosition | { pos: RoomPosition }, range = 1): void {
    creep.moveTo(target as RoomPosition, { ...MOVE_OPTS, range });
}

/** Flip the gather/act phase based on whether the creep is empty or full. */
export function toggleWorking(creep: Creep): void {
    const mem = creep.memory;
    if (mem.working && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
        mem.working = false;
    } else if (!mem.working && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        mem.working = true;
    }
}

export function harvest(creep: Creep, source: Source) {
    const result = creep.harvest(source);
    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creep, source, 1);
    }
    return result;
}

export function transfer(creep: Creep, target: Structure, resource: ResourceConstant = RESOURCE_ENERGY) {
    const result = creep.transfer(target, resource);
    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creep, target, 1);
    }
    return result;
}

export function withdraw(creep: Creep, target: Structure, resource: ResourceConstant = RESOURCE_ENERGY) {
    const result = creep.withdraw(target, resource);
    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creep, target, 1);
    }
    return result;
}

export function pickup(creep: Creep, resource: Resource) {
    const result = creep.pickup(resource);
    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creep, resource, 1);
    }
    return result;
}

export function upgrade(creep: Creep, controller: StructureController) {
    const result = creep.upgradeController(controller);
    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creep, controller, 3);
    }
    return result;
}

export function build(creep: Creep, site: ConstructionSite) {
    const result = creep.build(site);
    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creep, site, 3);
    }
    return result;
}

export function repair(creep: Creep, structure: Structure) {
    const result = creep.repair(structure);
    if (result === ERR_NOT_IN_RANGE) {
        moveTo(creep, structure, 3);
    }
    return result;
}
