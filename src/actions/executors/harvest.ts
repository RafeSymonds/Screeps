import { harvest, toggleWorking, transfer } from "actions/primitives";
import { Job } from "jobs/types";
import { WorldRoom } from "world/WorldRoom";
import { pickEnergySink } from "actions/logistics";

/**
 * Harvest executor. A pure miner (no CARRY) just mines — energy drops where it
 * stands, or into a container beneath it. A creep with CARRY mines until full,
 * then delivers to an adjacent container (static mining), else the nearest sink
 * (the bootstrap miner-hauler pattern), else drops for haulers.
 */
export function runHarvest(creep: Creep, job: Job, worldRoom: WorldRoom): void {
    const source = job.targetId ? Game.getObjectById(job.targetId as Id<Source>) : null;
    if (!source) {
        return;
    }

    if (creep.getActiveBodyparts(CARRY) === 0) {
        harvest(creep, source);
        return;
    }

    toggleWorking(creep);
    if (!creep.memory.working) {
        harvest(creep, source);
        return;
    }

    const container = source.pos
        .findInRange(FIND_STRUCTURES, 1)
        .find(
            structure =>
                structure.structureType === STRUCTURE_CONTAINER &&
                structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
    if (container) {
        transfer(creep, container);
        return;
    }

    const sink = pickEnergySink(creep, worldRoom);
    if (sink) {
        transfer(creep, sink);
        return;
    }

    creep.drop(RESOURCE_ENERGY);
}
