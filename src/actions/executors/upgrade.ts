import { toggleWorking, upgrade } from "actions/primitives";
import { Job } from "jobs/types";
import { WorldRoom } from "world/WorldRoom";
import { acquireEnergy } from "actions/energy";

/** Upgrade executor: gather energy, then upgrade the controller. */
export function runUpgrade(creep: Creep, _job: Job, worldRoom: WorldRoom): void {
    const controller = worldRoom.controller;
    if (!controller) {
        return;
    }
    toggleWorking(creep);
    if (!creep.memory.working) {
        acquireEnergy(creep, worldRoom);
    } else {
        upgrade(creep, controller);
    }
}
