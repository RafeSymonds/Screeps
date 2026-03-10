import { selectPriorityHostile, weakestFriendly } from "./CombatUtils";
import { World } from "world/World";

const TOWER_REPAIR_RESERVE = 700;
const TOWER_REPAIR_TARGET = 10000;

function lowestRepairTarget(room: Room): Structure | null {
    const targets = room
        .find(FIND_STRUCTURES)
        .filter(
            structure =>
                structure.hits < structure.hitsMax &&
                structure.structureType !== STRUCTURE_WALL &&
                structure.structureType !== STRUCTURE_RAMPART
        )
        .sort((a, b) => a.hits - b.hits);

    const critical = targets.find(structure => structure.hits < TOWER_REPAIR_TARGET);
    return critical ?? null;
}

export function performTowerDefense(world: World): void {
    for (const [, worldRoom] of world.rooms) {
        if (worldRoom.towers.length === 0) {
            continue;
        }

        const hostiles = worldRoom.hostileCreeps;
        const wounded = weakestFriendly(worldRoom.room.find(FIND_MY_CREEPS).filter(creep => creep.hits < creep.hitsMax));
        const repairTarget = lowestRepairTarget(worldRoom.room);

        for (const tower of worldRoom.towers) {
            if (hostiles.length > 0) {
                const target = selectPriorityHostile(tower.pos, hostiles);
                if (target) {
                    tower.attack(target);
                    continue;
                }
            }

            if (wounded) {
                tower.heal(wounded);
                continue;
            }

            if (repairTarget && tower.store.getUsedCapacity(RESOURCE_ENERGY) >= TOWER_REPAIR_RESERVE) {
                tower.repair(repairTarget);
            }
        }
    }
}
