import { build, toggleWorking, upgrade } from "actions/primitives";
import { Job } from "jobs/types";
import { LogisticsLedger } from "actions/ledger";
import { WorldRoom } from "world/WorldRoom";
import { acquireEnergy } from "actions/energy";
import { pickBuildSite } from "actions/logistics";

/**
 * Build executor: gather energy, then build the highest-value construction site
 * (type priority, then near-complete, then proximity). With no sites left this
 * tick (race before prune), fall back to upgrading so the creep never wastes a
 * tick.
 */
export function runBuild(creep: Creep, _job: Job, worldRoom: WorldRoom, ledger: LogisticsLedger): void {
    toggleWorking(creep);
    if (!creep.memory.working) {
        acquireEnergy(creep, worldRoom, ledger);
        return;
    }

    const site = pickBuildSite(creep, worldRoom);
    if (site) {
        build(creep, site);
        return;
    }
    if (worldRoom.controller) {
        upgrade(creep, worldRoom.controller);
    }
}
