import {
    EMPIRE_INTERVAL,
    MAX_REMOTES_PER_ROOM,
    REMOTE_DISTANCE_PER_ROOM,
    REMOTE_HYSTERESIS,
    REMOTE_INTEL_TTL,
    REMOTE_MIN_POP,
    REMOTE_MIN_RCL,
    REMOTE_RESERVE_MIN_TICKS,
    RESERVER_REQUEST_PRIORITY,
    SCOUT_REQUEST_PRIORITY,
    SCOUT_STALE_TICKS
} from "config/constants";
import { EmpireMemory, RemotePlan } from "empire/types";
import { SpawnRequest, SpawnRole } from "spawn/types";
import { describeExits, roomLinearDistance } from "intel/adjacency";
import { Phase } from "config/phases";
import { RoomIntel } from "intel/types";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { shouldRun } from "cpu/Scheduler";

/**
 * Empire planner (the cross-room allocation broker). Declarative for the economy
 * part — it writes `Memory.empire` (which job generation and the energy model read
 * as input) — and returns `SpawnRequest`s for the imperative residue (scouts now,
 * reservers in a later stage). Allocation is throttled like base planning; the
 * cheap request emission runs every tick. See docs/architecture/EMPIRE.md.
 */
export function planEmpire(world: World): SpawnRequest[] {
    if (shouldRun(Phase.Empire, EMPIRE_INTERVAL)) {
        recomputeRemotes(world);
    }
    // Threat + retreat run every tick (cheap) so abandonment is responsive — a miner
    // standing in a remote gives live vision the moment hostiles arrive, rather than
    // waiting for the throttled allocation recompute.
    updateRemoteThreat(world);
    retreatAbandonedCreeps(world);
    return empireRequests(world);
}

/** The empire memory slice, created on first use. */
export function ensureEmpire(): EmpireMemory {
    if (!Memory.empire) {
        Memory.empire = { remotes: {} };
    }
    return Memory.empire;
}

/** Active remotes owned by `home` — the set the economy mines and funds. */
export function activeRemotesFor(home: string): RemotePlan[] {
    if (!Memory.empire) {
        return [];
    }
    return Object.values(Memory.empire.remotes).filter(remote => remote.owner === home && remote.active);
}

/** Every remote in the plan, active or not. */
export function allRemotes(): RemotePlan[] {
    return Memory.empire ? Object.values(Memory.empire.remotes) : [];
}

/**
 * Refresh each remote's active/reserve flag from the freshest threat signal every
 * tick: live hostile count when the room is visible (a creep is standing in it),
 * else the last intel. A hostile creep or invader core pauses the remote (active +
 * reserve off); a clear reading reactivates it. Stale intel showing hostiles keeps
 * a remote paused until a scout re-checks it — so we don't march miners back into a
 * known-hostile room we just lost vision of.
 */
function updateRemoteThreat(world: World): void {
    if (!Memory.empire) {
        return;
    }
    for (const remote of Object.values(Memory.empire.remotes)) {
        const visible = world.getRoom(remote.roomName);
        const intel = Memory.rooms[remote.roomName]?.intel;
        const hostiles = visible ? visible.hostiles.length : intel?.hostiles ?? 0;
        const safe = hostiles === 0 && intel?.invaderCore !== true;
        remote.active = safe;
        remote.reserve = safe;
    }
}

/**
 * A remote miner/hauler whose remote is no longer active (abandoned/paused) loses
 * its `targetRoom` so it folds back into the home economy — a remote miner becomes
 * a home miner, a remote hauler a home hauler — instead of idling at a dead remote.
 * Reservers (controller-commanded) are left to expire naturally and are not
 * re-requested while the remote is paused.
 */
function retreatAbandonedCreeps(world: World): void {
    if (!Memory.empire) {
        return;
    }
    const active = new Set(
        Object.values(Memory.empire.remotes)
            .filter(remote => remote.active)
            .map(remote => remote.roomName)
    );
    for (const creep of world.creeps) {
        const target = creep.memory.targetRoom;
        if (target && !creep.memory.controller && !active.has(target)) {
            delete creep.memory.targetRoom;
        }
    }
}

interface RemoteClaim {
    owner: string;
    remote: string;
    intel: RoomIntel;
    dist: number;
}

/**
 * Recompute the remote→home assignment from intel: every owned room's viable
 * neighbors, each resolved to its nearest owner (with hysteresis so ownership
 * doesn't flap), then capped per owner. Whole-room ownership — a remote is mined
 * by exactly one home room.
 */
function recomputeRemotes(world: World): void {
    const empire = ensureEmpire();
    const previous = empire.remotes;

    const claims: RemoteClaim[] = [];
    for (const ownerRoom of world.myRooms) {
        if (ownerRoom.rcl < REMOTE_MIN_RCL) {
            continue;
        }
        for (const name of describeExits(ownerRoom.name)) {
            const intel = Memory.rooms[name]?.intel;
            if (!intel || !isViableRemote(intel)) {
                continue;
            }
            claims.push({
                owner: ownerRoom.name,
                remote: name,
                intel,
                dist: roomLinearDistance(ownerRoom.name, name) * REMOTE_DISTANCE_PER_ROOM
            });
        }
    }

    const byRemote = new Map<string, RemoteClaim[]>();
    for (const claim of claims) {
        const list = byRemote.get(claim.remote) ?? [];
        list.push(claim);
        byRemote.set(claim.remote, list);
    }

    const resolved: RemotePlan[] = [];
    for (const [remote, group] of byRemote) {
        const nearest = group.reduce((best, claim) => (claim.dist < best.dist ? claim : best));
        let owner = nearest.owner;
        const current = previous[remote];
        if (current && current.owner !== nearest.owner) {
            const incumbent = group.find(claim => claim.owner === current.owner);
            if (incumbent && incumbent.dist - nearest.dist < REMOTE_HYSTERESIS) {
                owner = current.owner; // not enough closer to justify reassigning
            }
        }
        const chosen = group.find(claim => claim.owner === owner) ?? nearest;
        const threatened = chosen.intel.hostiles > 0 || chosen.intel.invaderCore === true;
        resolved.push({
            roomName: remote,
            owner,
            sources: chosen.intel.sources.map(source => source.id),
            distance: chosen.dist,
            active: !threatened,
            // Reserve every active remote — doubling source output (5→10 e/tick) far
            // outweighs a periodic reserver. A threatened/invader-core remote (not
            // active) is never reserved.
            reserve: !threatened
        });
    }

    empire.remotes = capPerOwner(resolved);
    empire.lastPlanned = Game.time;
}

/** Keep each owner's closest MAX_REMOTES_PER_ROOM remotes; drop the rest. */
function capPerOwner(plans: RemotePlan[]): Record<string, RemotePlan> {
    const byOwner = new Map<string, RemotePlan[]>();
    for (const plan of plans) {
        const list = byOwner.get(plan.owner) ?? [];
        list.push(plan);
        byOwner.set(plan.owner, list);
    }
    const out: Record<string, RemotePlan> = {};
    for (const list of byOwner.values()) {
        list.sort((a, b) => a.distance - b.distance);
        for (const plan of list.slice(0, MAX_REMOTES_PER_ROOM)) {
            out[plan.roomName] = plan;
        }
    }
    return out;
}

/** A neighbor worth mining: freshly seen, unowned, has sources, no Source Keepers. */
function isViableRemote(intel: RoomIntel): boolean {
    if (Game.time - intel.lastSeen > REMOTE_INTEL_TTL) {
        return false;
    }
    if (intel.owner !== undefined) {
        return false; // owned by a player (our own rooms included) — not a remote
    }
    if (intel.sources.length === 0) {
        return false;
    }
    if (intel.sourceKeeper) {
        return false;
    }
    return true;
}

/** Scout + reserver requests for healthy owned rooms (the imperative residue). */
function empireRequests(world: World): SpawnRequest[] {
    const requests: SpawnRequest[] = [];
    for (const ownerRoom of world.myRooms) {
        if (!isHealthy(world, ownerRoom)) {
            continue;
        }
        const scout = scoutRequest(world, ownerRoom);
        if (scout) {
            requests.push(scout);
        }
        for (const remote of activeRemotesFor(ownerRoom.name)) {
            const reserver = reserverRequest(world, remote);
            if (reserver) {
                requests.push(reserver);
            }
        }
    }
    return requests;
}

/**
 * Request a reserver while a remote's reservation is low and none is en route. The
 * Claimer is a controller creep (commandReserver drives it) so it skips the matcher;
 * `targetRoom` tells it which remote to reserve. Invader-core rooms can't be
 * reserved, so they are skipped.
 */
function reserverRequest(world: World, remote: RemotePlan): SpawnRequest | undefined {
    if (!remote.reserve) {
        return undefined;
    }
    const intel = Memory.rooms[remote.roomName]?.intel;
    if (intel?.invaderCore) {
        return undefined;
    }
    const reservedTicks = intel?.reservation?.ticks ?? 0;
    if (reservedTicks >= REMOTE_RESERVE_MIN_TICKS) {
        return undefined; // still well reserved — no top-up needed
    }
    const tag = `remote-reserve:${remote.roomName}`;
    const alive = world.creepsForRoom(remote.owner).some(creep => creep.memory.controller === tag);
    if (alive) {
        return undefined;
    }
    return {
        key: tag,
        roomName: remote.owner,
        role: SpawnRole.Claimer,
        priority: RESERVER_REQUEST_PRIORITY,
        owner: tag,
        targetRoom: remote.roomName
    };
}

/**
 * Only an established room reaches out. The population gate matters: empire
 * SpawnRequests outrank economy in SpawnManager, so requiring a healthy live
 * population keeps a scout/reserver from ever preempting the recovery floor.
 */
function isHealthy(world: World, room: WorldRoom): boolean {
    if (room.rcl < REMOTE_MIN_RCL) {
        return false;
    }
    const economyPop = world.creepsForRoom(room.name).filter(creep => !creep.memory.controller).length;
    return economyPop >= REMOTE_MIN_POP;
}

/** Request one scout while any neighbor is unseen or stale and none is alive yet. */
function scoutRequest(world: World, ownerRoom: WorldRoom): SpawnRequest | undefined {
    const needsScout = describeExits(ownerRoom.name).some(name => {
        const intel = Memory.rooms[name]?.intel;
        return !intel || Game.time - intel.lastSeen > SCOUT_STALE_TICKS;
    });
    if (!needsScout) {
        return undefined;
    }
    const tag = `scout:${ownerRoom.name}`;
    const alive = world.creepsForRoom(ownerRoom.name).some(creep => creep.memory.controller === tag);
    if (alive) {
        return undefined;
    }
    return {
        key: tag,
        roomName: ownerRoom.name,
        role: SpawnRole.Scout,
        priority: SCOUT_REQUEST_PRIORITY,
        owner: tag
    };
}
