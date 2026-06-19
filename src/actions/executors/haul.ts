import { moveTo, pickup, toggleWorking, transfer, withdraw } from "actions/primitives";
import { Job } from "jobs/types";
import { LogisticsLedger } from "actions/ledger";
import { WorldRoom } from "world/WorldRoom";
import { EnergySourceKind, resolveEnergySink, resolveEnergySource } from "actions/logistics";

/**
 * Haul executor. A single room-level haul job; the executor commits to the best
 * pickup and sink via the sticky, reservation-aware logistics policy so haulers
 * spread across sources/sinks instead of herding onto the nearest one. Source
 * value: dropped (decays) > mining containers (buffers) > storage (reserve, and
 * only when a sink needs it, to avoid ping-pong), each scored by deliverable
 * load. Sink value: empty spawn / depleted tower-under-attack > extensions,
 * traded off against distance and how much of the load the sink can take.
 */
export function runHaul(creep: Creep, _job: Job, worldRoom: WorldRoom, ledger: LogisticsLedger): void {
    toggleWorking(creep);

    if (!creep.memory.working) {
        // Storage is eligible as a source only when a sink actually needs energy,
        // so we never withdraw from the reserve just to put it back (ping-pong).
        const allowStorage = worldRoom.energySinks().length > 0;
        const source = resolveEnergySource(creep, worldRoom, ledger, { allowStorage });
        if (source) {
            if (source.kind === EnergySourceKind.Pickup) {
                pickup(creep, source.target);
            } else {
                withdraw(creep, source.target);
            }
        }
        return;
    }

    const sink = resolveEnergySink(creep, worldRoom, ledger);
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
