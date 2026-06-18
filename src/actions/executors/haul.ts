import { moveTo, pickup, toggleWorking, transfer, withdraw } from "actions/primitives";
import { Job } from "jobs/types";
import { WorldRoom } from "world/WorldRoom";
import { nearestEnergySink } from "actions/energy";

/**
 * Haul executor. A single room-level haul job; the executor picks the best
 * pickup and sink dynamically each tick. Gather priority: dropped energy ->
 * mining containers -> storage (the buffer, drained only when a sink needs it).
 * Deliver priority: spawn/extension/tower -> storage as overflow.
 */
export function runHaul(creep: Creep, _job: Job, worldRoom: WorldRoom): void {
    toggleWorking(creep);

    if (!creep.memory.working) {
        // Dropped energy decays — grab it first.
        if (worldRoom.droppedEnergy.length > 0) {
            const pile = creep.pos.findClosestByRange(worldRoom.droppedEnergy);
            if (pile) {
                pickup(creep, pile);
                return;
            }
        }
        // Move fresh mining output before touching the storage buffer.
        const containers = worldRoom.containers.filter(c => c.store.getUsedCapacity(RESOURCE_ENERGY) > 0);
        if (containers.length > 0) {
            const container = creep.pos.findClosestByRange(containers);
            if (container) {
                withdraw(creep, container);
                return;
            }
        }
        // Storage is the last-resort source, and only when a sink actually needs it
        // (prevents withdraw-then-redeposit ping-pong).
        if (
            worldRoom.storage &&
            worldRoom.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
            worldRoom.energySinks().length > 0
        ) {
            withdraw(creep, worldRoom.storage);
            return;
        }
        return;
    }

    const sink = nearestEnergySink(creep, worldRoom);
    if (sink) {
        transfer(creep, sink);
        return;
    }
    // Sinks are full — bank the surplus into storage.
    if (worldRoom.storage && worldRoom.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        transfer(creep, worldRoom.storage);
        return;
    }
    // No sink and no storage (early game): drop the surplus at the controller as an
    // upgrade buffer rather than hoarding it. Upgraders/builders gather dropped
    // energy first, so this turns otherwise-idle hauler loads into upgrade/build
    // throughput instead of locking energy inside parked haulers.
    if (worldRoom.controller) {
        if (creep.pos.inRangeTo(worldRoom.controller, 3)) {
            creep.drop(RESOURCE_ENERGY);
        } else {
            moveTo(creep, worldRoom.controller, 3);
        }
    }
}
