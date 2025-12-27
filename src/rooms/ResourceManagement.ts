export type EnergyTarget =
    | StructureSpawn
    | StructureExtension
    | StructureContainer
    | StructureStorage
    | Tombstone
    | Ruin
    | Resource;

enum EnergyPickupType {
    PICKUP,
    WITHDRAW
}

export function findBestEnergySource(creep: Creep): EnergyTarget | null {
    const room = creep.room;

    const candidates: {
        target: EnergyTarget;
        range: number;
    }[] = [];

    // Dropped energy (highest priority usually)
    room.find(FIND_DROPPED_RESOURCES).forEach(resource => {
        if (resource.resourceType === RESOURCE_ENERGY && resource.amount > 0) {
            candidates.push({
                target: resource,
                range: creep.pos.getRangeTo(resource)
            });
        }
    });

    // Structures with energy
    room.find(FIND_STRUCTURES).forEach(structure => {
        if (
            structure instanceof StructureSpawn ||
            structure instanceof StructureExtension ||
            structure instanceof StructureContainer ||
            structure instanceof StructureStorage
        ) {
            const energy = structure.store.getUsedCapacity(RESOURCE_ENERGY);
            if (energy > 0) {
                candidates.push({
                    target: structure,
                    range: creep.pos.getRangeTo(structure)
                });
            }
        }
    });

    // Tombstones
    room.find(FIND_TOMBSTONES).forEach(tombstone => {
        if (tombstone.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            candidates.push({
                target: tombstone,
                range: creep.pos.getRangeTo(tombstone)
            });
        }
    });

    // Ruins
    room.find(FIND_RUINS).forEach(ruin => {
        if (ruin.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            candidates.push({
                target: ruin,
                range: creep.pos.getRangeTo(ruin)
            });
        }
    });

    if (candidates.length === 0) {
        return null;
    }

    // Closest wins (simple + cheap)
    candidates.sort((a, b) => a.range - b.range);
    return candidates[0].target;
}
