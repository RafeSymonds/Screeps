import { moveTo, moveToRoom, pickup, toggleWorking, transfer, withdraw } from "actions/primitives";
import { REMOTE_HAUL_PATIENCE } from "config/constants";
import { Job } from "jobs/types";
import { LogisticsLedger } from "actions/ledger";
import { World } from "world/World";
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
            return;
        }
        // Nothing to gather right now. A carrying hauler must not idle on a partial
        // load (the source dried up mid-fill) — deliver what it has; only a truly
        // empty hauler waits for the next pickup.
        if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            return;
        }
        creep.memory.working = true; // fall through to the deliver phase
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

/**
 * Cross-room haul executor (remote mining). The same gather→deliver phasing as the
 * local hauler, but split across two rooms: gather the miner's dropped output in
 * the remote, carry it home, deliver to the owner's storage/sinks. Routed from
 * runCreep whenever the haul job carries `data.homeRoom`, regardless of whether the
 * remote is currently visible — the deliver leg runs while the remote is unseen.
 *
 * Each phase resolves its targets in the correct room, so the sticky/ledger-aware
 * logistics policy is reused unchanged: gathering scopes to the remote (no storage
 * there), delivering scopes to home. `toggleWorking` flips on full/empty, so the
 * round trip emerges without explicit travel state.
 */
export function runRemoteHaul(creep: Creep, job: Job, world: World, ledger: LogisticsLedger): void {
    const remoteName = job.roomName;
    const homeName = (job.data?.homeRoom as string | undefined) ?? creep.memory.home;
    toggleWorking(creep);

    if (!creep.memory.working) {
        // GATHER in the remote. Travel to the room cheaply (short cross-room path);
        // once inside, clear any exit tile so border ambiguity can't bounce us, then
        // the in-room logic moves to the actual energy.
        const remote = creep.room.name === remoteName ? world.getRoom(remoteName) : undefined;
        if (!remote) {
            moveToRoom(creep, remoteName);
            return;
        }
        if (clearExitTile(creep)) {
            return;
        }
        const source = resolveEnergySource(creep, remote, ledger, { allowStorage: false });
        if (source) {
            creep.memory.waited = 0;
            if (source.kind === EnergySourceKind.Pickup) {
                pickup(creep, source.target);
            } else {
                withdraw(creep, source.target);
            }
            return;
        }

        // Nothing to pick up right now. An empty hauler just waits staged near a
        // source for the next drop. A partially-loaded one tolerates brief gaps (a
        // live miner refills every tick) but must not idle on a dead source forever:
        // after REMOTE_HAUL_PATIENCE barren ticks it delivers the partial load.
        const carrying = creep.store.getUsedCapacity(RESOURCE_ENERGY);
        const waited = (creep.memory.waited ?? 0) + 1;
        creep.memory.waited = waited;
        if (carrying === 0 || waited < REMOTE_HAUL_PATIENCE) {
            if (job.pos) {
                moveTo(creep, new RoomPosition(job.pos.x, job.pos.y, job.pos.roomName), 2);
            }
            return;
        }
        creep.memory.waited = 0;
        creep.memory.working = true; // commit to delivering the partial load this tick
    }

    // DELIVER home. Travel to the room cheaply, then clear any exit tile before the
    // in-room delivery logic runs.
    const home = creep.room.name === homeName ? world.getRoom(homeName) : undefined;
    if (!home) {
        moveToRoom(creep, homeName);
        return;
    }
    if (clearExitTile(creep)) {
        return;
    }
    const sink = resolveEnergySink(creep, home, ledger);
    if (sink) {
        transfer(creep, sink);
        return;
    }
    if (home.storage && home.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        transfer(creep, home.storage);
        return;
    }
    // No sink and no storage: drop at the controller as an upgrade buffer (mirrors
    // the local hauler fallback) rather than parking a full load.
    if (home.controller) {
        if (creep.pos.inRangeTo(home.controller, 3)) {
            creep.drop(RESOURCE_ENERGY);
        } else {
            moveTo(creep, home.controller, 3);
        }
    }
}

/**
 * If the creep is sitting on a room-edge (exit) tile, step one tile inward with a
 * cheap directional move (no PathFinder) and report it. A cross-room hauler that has
 * just arrived lingers on the exit otherwise, where border ambiguity bounces it back
 * and forth between the two rooms; nudging it off the edge lets the in-room logic
 * take over cleanly. O(1), so it never costs the CPU a per-tick cross-room repath would.
 */
function clearExitTile(creep: Creep): boolean {
    const { x, y } = creep.pos;
    if (x === 0) {
        creep.move(RIGHT);
    } else if (x === 49) {
        creep.move(LEFT);
    } else if (y === 0) {
        creep.move(BOTTOM);
    } else if (y === 49) {
        creep.move(TOP);
    } else {
        return false;
    }
    return true;
}
