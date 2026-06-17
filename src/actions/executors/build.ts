import { build, toggleWorking, upgrade } from "actions/primitives";
import { Job } from "jobs/types";
import { WorldRoom } from "world/WorldRoom";
import { acquireEnergy } from "actions/energy";

/**
 * Build executor: gather energy, then build the nearest construction site. With
 * no sites left this tick (race before prune), fall back to upgrading so the
 * creep never wastes a tick.
 */
export function runBuild(creep: Creep, _job: Job, worldRoom: WorldRoom): void {
    toggleWorking(creep);
    if (!creep.memory.working) {
        acquireEnergy(creep, worldRoom);
        return;
    }

    const site = creep.pos.findClosestByRange(worldRoom.constructionSites);
    if (site) {
        build(creep, site);
        return;
    }
    if (worldRoom.controller) {
        upgrade(creep, worldRoom.controller);
    }
}
