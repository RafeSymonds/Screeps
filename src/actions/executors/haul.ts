import { moveTo, pickup, toggleWorking, transfer, withdraw } from "actions/primitives";
import { Job } from "jobs/types";
import { WorldRoom } from "world/WorldRoom";
import { nearestEnergySink } from "actions/energy";

/**
 * Haul executor. Gathers from dropped energy / containers / storage and delivers
 * to spawn-extension-tower sinks. A single room-level haul job; the executor
 * picks the best pickup and sink dynamically each tick.
 */
export function runHaul(creep: Creep, _job: Job, worldRoom: WorldRoom): void {
    toggleWorking(creep);

    if (!creep.memory.working) {
        if (worldRoom.droppedEnergy.length > 0) {
            const pile = creep.pos.findClosestByRange(worldRoom.droppedEnergy);
            if (pile) {
                pickup(creep, pile);
                return;
            }
        }
        const stores = worldRoom.energyStores();
        if (stores.length > 0) {
            const store = creep.pos.findClosestByRange(stores);
            if (store) {
                withdraw(creep, store);
                return;
            }
        }
        return;
    }

    const sink = nearestEnergySink(creep, worldRoom);
    if (sink) {
        transfer(creep, sink);
        return;
    }
    // Everything is full — idle near the controller so we're ready to refill.
    if (worldRoom.controller) {
        moveTo(creep, worldRoom.controller, 3);
    }
}
