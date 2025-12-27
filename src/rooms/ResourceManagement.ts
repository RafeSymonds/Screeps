type EnergyWithdrawTarget =
    | StructureSpawn
    | StructureExtension
    | StructureContainer
    | StructureStorage
    | Tombstone
    | Ruin;

enum EnergyPickupType {
    PICKUP,
    WITHDRAW
}

export type EnergyPickupTarget =
    | { kind: EnergyPickupType.PICKUP; resource: Resource }
    | { kind: EnergyPickupType.WITHDRAW; target: EnergyWithdrawTarget };

export function findBestEnergySource(creep: Creep): EnergyPickupTarget | null {
    const room = creep.room;

    const candidates: {
        target: EnergyPickupTarget;
        range: number;
    }[] = [];

    // Dropped energy (highest priority usually)
    room.find(FIND_DROPPED_RESOURCES).forEach(resource => {
        if (resource.resourceType === RESOURCE_ENERGY && resource.amount > 0) {
            candidates.push({
                target: { kind: EnergyPickupType.PICKUP, resource },
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
                    target: { kind: EnergyPickupType.WITHDRAW, target: structure },
                    range: creep.pos.getRangeTo(structure)
                });
            }
        }
    });

    // Tombstones
    room.find(FIND_TOMBSTONES).forEach(tombstone => {
        if (tombstone.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            candidates.push({
                target: { kind: EnergyPickupType.WITHDRAW, target: tombstone },
                range: creep.pos.getRangeTo(tombstone)
            });
        }
    });

    // Ruins
    room.find(FIND_RUINS).forEach(ruin => {
        if (ruin.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            candidates.push({
                target: { kind: EnergyPickupType.WITHDRAW, target: ruin },
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
