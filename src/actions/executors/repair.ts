import { repair, toggleWorking, upgrade } from "actions/primitives";
import { Job } from "jobs/types";
import { WorldRoom } from "world/WorldRoom";
import { acquireEnergy } from "actions/energy";

/**
 * Repair executor: gather energy, then repair the most-damaged eligible
 * structure (roads/containers below the threshold). With nothing left to repair
 * this tick (race before prune), fall back to upgrading so the creep never
 * wastes a tick.
 */
export function runRepair(creep: Creep, _job: Job, worldRoom: WorldRoom): void {
    toggleWorking(creep);
    if (!creep.memory.working) {
        acquireEnergy(creep, worldRoom);
        return;
    }

    const target = mostDamaged(worldRoom.repairTargets());
    if (target) {
        repair(creep, target);
        return;
    }
    if (worldRoom.controller) {
        upgrade(creep, worldRoom.controller);
    }
}

/** The structure with the lowest hits/hitsMax ratio. */
function mostDamaged(structures: Structure[]): Structure | undefined {
    let worst: Structure | undefined;
    let worstRatio = Infinity;
    for (const structure of structures) {
        const ratio = structure.hits / structure.hitsMax;
        if (ratio < worstRatio) {
            worstRatio = ratio;
            worst = structure;
        }
    }
    return worst;
}
