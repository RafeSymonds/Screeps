import { TOWER_MIN_ENERGY_TO_REPAIR, TOWER_REPAIR_THRESHOLD } from "config/constants";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";

/**
 * Tactical tower control. Priority: attack hostiles, then heal wounded creeps,
 * then repair critical non-fortification structures (kept off when low on energy
 * so defense always has ammo).
 */
export function runTowers(world: World): void {
    for (const worldRoom of world.myRooms) {
        for (const tower of worldRoom.towers) {
            runTower(tower, worldRoom);
        }
    }
}

function runTower(tower: StructureTower, worldRoom: WorldRoom): void {
    if (worldRoom.hostiles.length > 0) {
        const target = tower.pos.findClosestByRange(worldRoom.hostiles);
        if (target) {
            tower.attack(target);
            return;
        }
    }

    const wounded = worldRoom.room.find(FIND_MY_CREEPS, { filter: creep => creep.hits < creep.hitsMax });
    if (wounded.length > 0) {
        const target = tower.pos.findClosestByRange(wounded);
        if (target) {
            tower.heal(target);
            return;
        }
    }

    if (tower.store.getUsedCapacity(RESOURCE_ENERGY) >= TOWER_MIN_ENERGY_TO_REPAIR) {
        const damaged = worldRoom.room.find(FIND_STRUCTURES, {
            filter: structure =>
                structure.structureType !== STRUCTURE_WALL &&
                structure.structureType !== STRUCTURE_RAMPART &&
                structure.hits < structure.hitsMax * TOWER_REPAIR_THRESHOLD
        });
        if (damaged.length > 0) {
            const target = tower.pos.findClosestByRange(damaged);
            if (target) {
                tower.repair(target);
            }
        }
    }
}
