import { selectPriorityHostile, weakestFriendly } from "./CombatUtils";
import { World } from "world/World";
import { computeThrottleTier, ThrottleTier } from "cpu/CpuBudget";

const TOWER_REPAIR_RESERVE = 700;
const TOWER_REPAIR_TARGET = 10000;
const TOWER_FORTIFICATION_RESERVE = 500;

function rampartHpTarget(rcl: number): number {
    switch (rcl) {
        case 2:
        case 3:
            return 1_000;
        case 4:
            return 10_000;
        case 5:
            return 100_000;
        case 6:
            return 500_000;
        case 7:
            return 1_000_000;
        case 8:
            return 10_000_000;
        default:
            return 0;
    }
}

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

function lowestFortification(room: Room, target: number): Structure | null {
    const fortifications = room
        .find(FIND_STRUCTURES)
        .filter(
            structure =>
                (structure.structureType === STRUCTURE_WALL ||
                    structure.structureType === STRUCTURE_RAMPART) &&
                structure.hits < target
        )
        .sort((a, b) => a.hits - b.hits);

    return fortifications[0] ?? null;
}

export function performTowerDefense(world: World): void {
    const tier = computeThrottleTier();
    const skipFortification = tier === ThrottleTier.CRITICAL || tier === ThrottleTier.LOW;

    for (const [, worldRoom] of world.rooms) {
        if (worldRoom.towers.length === 0) {
            continue;
        }

        const hostiles = worldRoom.hostileCreeps;
        const wounded = weakestFriendly(worldRoom.room.find(FIND_MY_CREEPS).filter(creep => creep.hits < creep.hitsMax));
        const repairTarget = lowestRepairTarget(worldRoom.room);

        const rcl = worldRoom.room.controller?.level ?? 0;
        const hpTarget = rampartHpTarget(rcl);
        const fortificationTarget = !skipFortification && hpTarget > 0 ? lowestFortification(worldRoom.room, hpTarget) : null;

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
                continue;
            }

            if (
                hostiles.length === 0 &&
                fortificationTarget &&
                tower.store.getUsedCapacity(RESOURCE_ENERGY) >= TOWER_FORTIFICATION_RESERVE
            ) {
                tower.repair(fortificationTarget);
            }
        }
    }
}
