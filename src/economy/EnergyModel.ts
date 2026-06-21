/**
 * EnergyModel — the per-room energy-flow controller that drives spawning.
 *
 * Population is an OUTPUT here, not a hardcoded composition. Each room is modeled
 * as a flow with three stages, in dependency order:
 *
 *   1. INCOME      — saturate every source. A source regenerates 10 e/tick, and
 *                    HARVEST_POWER is 2, so 5 WORK fully drains it. Income has a
 *                    hard ceiling (sources × 10); more WORK mines nothing.
 *   2. LOGISTICS   — move that income before it backs up. A hauler delivers
 *                    ~50·CARRY / (tripFactor·distance) e/tick, so the CARRY needed
 *                    scales with income AND source→sink distance — which is why a
 *                    fixed hauler count is wrong. A rising backlog (dropped +
 *                    mining-container energy) means we are under-hauled.
 *   3. CONSUMPTION — spend 100% of delivered energy. Spawn/extension/tower refill
 *                    and construction are bounded; UPGRADE is the elastic sink, so
 *                    consumers (WORK) are sized to burn the surplus. Storage is the
 *                    buffer: below a floor we hoard, above a target we spend the
 *                    surplus on upgrade, using the smoothed storage trend as the
 *                    surplus/deficit signal.
 *
 * `roomDemand` produces the three targets; `pickDeficitRole` chooses which to fund
 * next — INCOME and LOGISTICS are inelastic infrastructure and are funded before
 * the ELASTIC consumer, which only soaks the surplus they create; `senseEconomy`
 * keeps the storage integrator fresh each tick. SpawnManager maps the chosen stage
 * to a body.
 */

import {
    CONSUMER_EFFICIENCY,
    ECONOMY_BACKLOG_CARRY_BONUS,
    ECONOMY_BACKLOG_THRESHOLD,
    ECONOMY_EMA_ALPHA,
    ECONOMY_HAUL_TRIP_FACTOR,
    ECONOMY_MAX_CONSUMER_WORK,
    ECONOMY_MIN_CONSUMER_WORK,
    ECONOMY_STORAGE_FLOOR,
    ECONOMY_STORAGE_TARGET,
    MINER_WORK_PER_SOURCE,
    REMOTE_POP_HEADROOM
} from "config/constants";
import { EconomyMemory, LaborKind, LaborTarget, RoomDemand } from "economy/types";
import { activeRemotesFor } from "empire/Empire";
import { RemotePlan } from "empire/types";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";

/** Body parts alive in a room, bucketed by the flow stage each serves. */
interface LaborByKind {
    minerWork: number;
    haulerCarry: number;
    consumerWork: number;
}

/**
 * Update each owned room's storage integrator (smoothed level + per-tick trend).
 * Cheap and O(1) per room, so it runs every tick — the smoothing turns the
 * spawn-cycle sawtooth into a stable surplus/deficit signal. Tolerates throttled
 * or skipped ticks by dividing the level delta by the elapsed tick count.
 */
export function senseEconomy(world: World): void {
    for (const worldRoom of world.myRooms) {
        const mem = ensureEconomy(worldRoom.name);
        const level = worldRoom.storageEnergy();

        if (mem.lastLevel !== undefined && mem.lastTick !== undefined && Game.time > mem.lastTick) {
            const perTick = (level - mem.lastLevel) / (Game.time - mem.lastTick);
            mem.storageTrendEMA =
                mem.storageTrendEMA === undefined
                    ? perTick
                    : mem.storageTrendEMA + ECONOMY_EMA_ALPHA * (perTick - mem.storageTrendEMA);
        }
        mem.storageEMA =
            mem.storageEMA === undefined ? level : mem.storageEMA + ECONOMY_EMA_ALPHA * (level - mem.storageEMA);
        mem.lastLevel = level;
        mem.lastTick = Game.time;
    }
}

/** Compute the three flow targets and their live supply for a room. */
export function roomDemand(worldRoom: WorldRoom, world: World): RoomDemand {
    const sources = worldRoom.sources.length;
    const regenPerSource = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME; // 10 e/tick
    const ceiling = sources * regenPerSource;

    // Home labor only: creeps tagged for a remote (targetRoom) serve that remote's
    // sources, not this room's, and are accounted by remoteDemand instead — so a
    // remote miner's WORK is never miscounted as home income.
    const homeCreeps = world.creepsForRoom(worldRoom.name).filter(creep => !creep.memory.targetRoom);
    const supply = laborByKind(homeCreeps);

    // 1. Income: actual mining (capped at regen), and the WORK to saturate sources.
    const income = Math.min(supply.minerWork * HARVEST_POWER, ceiling);
    const minerTarget = sources * MINER_WORK_PER_SOURCE;

    // 2. Logistics: CARRY scaled by how saturated mining actually is, by distance,
    //    plus a flat bump when undelivered energy is piling up.
    const saturation = ceiling > 0 ? income / ceiling : 0;
    const haulerTarget = haulerCarryTarget(worldRoom, regenPerSource, saturation);

    // 3. Consumption: elastic, gated by the storage buffer band.
    const econ = Memory.rooms[worldRoom.name]?.economy;
    const storageLevel = econ?.storageEMA ?? worldRoom.storageEnergy();
    const storageTrend = econ?.storageTrendEMA ?? 0;
    const consumerTarget = consumerWorkTarget(worldRoom, income, storageLevel, storageTrend);

    return {
        roomName: worldRoom.name,
        miner: { target: minerTarget, supply: supply.minerWork },
        hauler: { target: haulerTarget, supply: supply.haulerCarry },
        consumer: { target: consumerTarget, supply: supply.consumerWork },
        income,
        backlog: worldRoom.backlogEnergy(),
        storageLevel,
        storageTrend
    };
}

/**
 * Choose which flow stage to fund next, or null if all targets are met.
 *
 * Income and logistics are INELASTIC infrastructure: a room needs exactly enough
 * WORK to drain its sources and enough CARRY to move that income — no more is
 * useful. The consumer (upgrade) is the ELASTIC overflow, sized to burn whatever
 * surplus the infrastructure delivers. So infrastructure is funded FIRST (the two
 * stages compete by deficit ratio, ties breaking upstream — mine before haul);
 * the consumer is funded only once both are satisfied, with the surplus it is
 * meant to absorb.
 *
 * Why subordinate rather than rank all three flat: the consumer target is
 * income-derived and capped high (ECONOMY_MAX_CONSUMER_WORK), so it is routinely
 * unreachable within the population cap and shows a near-permanent deficit. Ranked
 * flat, that deficit outranks the *finite* miner deficit — so the moment minimal
 * mining exists, every remaining spawn slot becomes an upgrader and the sources
 * never finish saturating (observed: a fleet that scales workers/haulers but stays
 * stuck at ~2 WORK/source while income-limited). Subordinating the consumer fixes
 * that without a parts-based "income first" gate that would instead starve
 * LOGISTICS — the failure the old flat ranking guarded against. Logistics stays
 * infra-tier, so it is never starved.
 *
 * Safety valve: if upgrade presence has collapsed below the floor, the consumer
 * rejoins the ranking so the controller can never be left to downgrade.
 */
export function pickDeficitRole(demand: RoomDemand): LaborKind | null {
    const consumerDeficit = deficit(demand.consumer);
    const infrastructure: Array<[LaborKind, number]> = [
        [LaborKind.Miner, deficit(demand.miner)],
        [LaborKind.Hauler, deficit(demand.hauler)]
    ];
    if (demand.consumer.supply < ECONOMY_MIN_CONSUMER_WORK) {
        infrastructure.push([LaborKind.Consumer, consumerDeficit]);
    }

    const best = pickLargestDeficit(infrastructure);
    if (best) {
        return best;
    }
    // Infrastructure met: spend the remaining surplus on the elastic consumer.
    return consumerDeficit > 0 ? LaborKind.Consumer : null;
}

// --- Remote mining (the empire's economy reach) ---------------------------------
//
// Each assigned remote is sized like a miniature income+logistics flow funded by
// its owner: WORK to saturate its sources, CARRY for the round trip to the owner's
// storage. Remote infrastructure is ranked by DEFICIT alongside home infrastructure
// (see pickRoomLabor) and ahead of the elastic consumer, so a brand-new unstaffed
// remote (deficit 1.0) is funded once home is mostly served — not gated behind home
// being perfectly saturated, which a chronically near-met home never clears. "How
// much remote mining" stays an OUTPUT that self-limits: a far remote needs so much
// CARRY it loses spawn slots, and the per-room population cap bounds the total. See
// docs/architecture/EMPIRE.md.

/** A remote's labor targets and live supply, sized separately from its owner room. */
export interface RemoteDemand {
    roomName: string;
    minerWork: LaborTarget;
    haulerCarry: LaborTarget;
}

/**
 * Size one remote. Supply is the owner's creeps tagged for THIS remote (by body
 * shape), so remote miners/haulers are counted here and never in the home room.
 * Hauler demand is income-derived, so it stays 0 until a miner is actually
 * producing — the economy funds the miner first and never spawns idle haulers.
 */
export function remoteDemand(remote: RemotePlan, world: World): RemoteDemand {
    const sourceCount = remote.sources.length;
    const ceiling = sourceCount * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME);

    const creeps = world.creepsForRoom(remote.owner).filter(creep => creep.memory.targetRoom === remote.roomName);
    const supply = laborByKind(creeps);

    const income = Math.min(supply.minerWork * HARVEST_POWER, ceiling);
    const carry = (income * ECONOMY_HAUL_TRIP_FACTOR * remote.distance) / CARRY_CAPACITY;

    return {
        roomName: remote.roomName,
        minerWork: { target: sourceCount * MINER_WORK_PER_SOURCE, supply: supply.minerWork },
        haulerCarry: { target: Math.ceil(carry), supply: supply.haulerCarry }
    };
}

/**
 * The most under-supplied remote stage for `home` and its deficit ratio, or null if
 * every assigned remote is staffed. Within a remote, income (miner) is considered
 * before logistics (hauler); across remotes, the largest deficit wins. The caller
 * ranks this against home infrastructure.
 */
export function pickRemoteDeficit(
    home: string,
    world: World
): { kind: LaborKind; roomName: string; deficit: number } | null {
    let best: { kind: LaborKind; roomName: string; deficit: number } | null = null;
    for (const remote of activeRemotesFor(home)) {
        const demand = remoteDemand(remote, world);
        const minerDeficit = deficit(demand.minerWork);
        const candidate =
            minerDeficit > 0
                ? { kind: LaborKind.Miner, roomName: remote.roomName, deficit: minerDeficit }
                : { kind: LaborKind.Hauler, roomName: remote.roomName, deficit: deficit(demand.haulerCarry) };
        if (candidate.deficit > (best?.deficit ?? 0)) {
            best = candidate;
        }
    }
    return best;
}

/**
 * The next labor a room should fund. HOME infrastructure comes first and in full —
 * a room must finish saturating and hauling its OWN sources before any spawn slot
 * goes to a remote (remotes are an extension funded by surplus, never at the cost of
 * same-room mining). Order: home income/logistics (pickDeficitRole) → the safety
 * valve (an upgrader if the controller could downgrade) → remote infrastructure →
 * the elastic consumer. `roomName` is set only for a remote stage (the room to tag
 * the creep with); undefined means home. SpawnManager maps this to a body.
 *
 * Remote labor is reachable, not starved: home infra targets are finite, so once a
 * room has its ~2 miners + haulers the home deficit hits zero and remotes get the
 * next slots. It just never jumps the queue ahead of home mining — the failure mode
 * that an earlier flat deficit-ranking caused (a fresh remote's deficit 1.0 beating a
 * half-mined home's 0.5, leaving same-room sources permanently under-mined).
 */
export function pickRoomLabor(worldRoom: WorldRoom, world: World): { kind: LaborKind; roomName?: string } | null {
    const demand = roomDemand(worldRoom, world);
    const homeKind = pickDeficitRole(demand);

    // Home infrastructure (income then logistics) takes every slot it needs first.
    // "Home income" is dedicated-miner supply, so a room finishes SPECIALIZING — it
    // builds its real miners — before any slot goes to a remote. (Counting workers as
    // coverage was a mistake: a worker-heavy room read as "covered" and the
    // dedicated-miner slots were diverted to remotes, so the home never specialized.)
    if (homeKind === LaborKind.Miner || homeKind === LaborKind.Hauler) {
        return { kind: homeKind };
    }
    // Safety valve: an upgrader to stop a controller downgrade outranks remotes.
    if (homeKind === LaborKind.Consumer && demand.consumer.supply < ECONOMY_MIN_CONSUMER_WORK) {
        return { kind: LaborKind.Consumer };
    }
    // Home is satisfied → extend to remotes (growing income) before the consumer.
    const remote = pickRemoteDeficit(worldRoom.name, world);
    if (remote) {
        return { kind: remote.kind, roomName: remote.roomName };
    }
    // Otherwise the elastic consumer soaks the surplus.
    return homeKind === LaborKind.Consumer ? { kind: LaborKind.Consumer } : null;
}

/** Extra population a room is allowed for its active remotes, above the base cap. */
export function remoteHeadroom(home: string): number {
    return activeRemotesFor(home).length * REMOTE_POP_HEADROOM;
}

/** Largest strictly-positive deficit, ties breaking toward the earliest listed. */
function pickLargestDeficit(ranked: Array<[LaborKind, number]>): LaborKind | null {
    let best: LaborKind | null = null;
    let bestDeficit = 0; // a strictly positive deficit is required to spawn anything
    for (const [kind, value] of ranked) {
        if (value > bestDeficit) {
            bestDeficit = value;
            best = kind;
        }
    }
    return best;
}

/** CARRY needed to ferry the current income over each source→sink distance. */
function haulerCarryTarget(worldRoom: WorldRoom, regenPerSource: number, saturation: number): number {
    const sink = worldRoom.storage ?? worldRoom.spawns[0];
    if (!sink || worldRoom.sources.length === 0) {
        return 0;
    }
    let carry = 0;
    for (const source of worldRoom.sources) {
        const distance = source.pos.getRangeTo(sink.pos);
        carry += (regenPerSource * ECONOMY_HAUL_TRIP_FACTOR * distance) / CARRY_CAPACITY;
    }
    let target = Math.ceil(carry * saturation);
    if (worldRoom.backlogEnergy() > ECONOMY_BACKLOG_THRESHOLD) {
        target += ECONOMY_BACKLOG_CARRY_BONUS;
    }
    return target;
}

/**
 * Elastic consumer WORK: sized to burn the surplus income, gated by the storage
 * buffer band. A small floor is always kept so the controller never downgrades,
 * and a cap stops a rich room from spawning an unbounded upgrader swarm (the
 * uncapped surplus then overflows into storage — which is fine, storage is the
 * buffer). CONSUMER_EFFICIENCY accounts for time spent fetching vs upgrading.
 */
function consumerWorkTarget(worldRoom: WorldRoom, income: number, storageLevel: number, storageTrend: number): number {
    let bandFactor: number;
    if (!worldRoom.storage) {
        // Pre-storage: nowhere to bank, so overflow just decays — consume it all.
        bandFactor = 1;
    } else if (storageLevel < ECONOMY_STORAGE_FLOOR) {
        bandFactor = 0; // emergency reserve — hoard
    } else if (storageLevel < ECONOMY_STORAGE_TARGET) {
        bandFactor = 0.5; // build the buffer, upgrade modestly
    } else {
        bandFactor = storageTrend >= 0 ? 1 : 0.5; // surplus → spend it; draining → ease off
    }

    const surplus = income * bandFactor;
    const work = Math.ceil(surplus / (UPGRADE_CONTROLLER_POWER * CONSUMER_EFFICIENCY));
    return Math.min(ECONOMY_MAX_CONSUMER_WORK, Math.max(ECONOMY_MIN_CONSUMER_WORK, work));
}

/**
 * Bucket live body parts by the stage they serve, gauged from the BODY SHAPE, not
 * the `spawnRole` tag:
 *   - WORK, no CARRY → a dedicated miner — income.
 *   - CARRY, no WORK → a dedicated hauler — logistics.
 *   - WORK and CARRY → a worker — consumption ONLY.
 *
 * The deliberate asymmetry: a worker (WORK+CARRY) is capability-eligible to mine,
 * but it is NEVER counted as income here. So the model keeps provisioning real
 * miners until sources are saturated, and workers only mine as a matcher last
 * resort (no energy to collect) — "we'd rather a worker never mine unless needed."
 * The cost is a known, accepted approximation: a worker that *is* gap-filling on a
 * source goes uncounted, so income is briefly under-read; this self-corrects as
 * dedicated miners arrive. Counting by shape (not the role tag) is also what lets
 * the bootstrap and upgrade bodies collapse into one `Worker` — the tag no longer
 * carries accounting meaning.
 */
function laborByKind(creeps: Creep[]): LaborByKind {
    const labor: LaborByKind = { minerWork: 0, haulerCarry: 0, consumerWork: 0 };
    for (const creep of creeps) {
        const work = creep.getActiveBodyparts(WORK);
        const carry = creep.getActiveBodyparts(CARRY);
        if (work > 0 && carry === 0) {
            labor.minerWork += work; // dedicated miner
        } else if (carry > 0 && work === 0) {
            labor.haulerCarry += carry; // dedicated hauler
        } else if (work > 0 && carry > 0) {
            labor.consumerWork += work; // worker — consumption only, never income
        }
    }
    return labor;
}

function deficit(labor: LaborTarget): number {
    if (labor.target <= 0) {
        return 0;
    }
    return (labor.target - labor.supply) / labor.target;
}

/** Get (creating if needed) a room's persisted economy slice. */
function ensureEconomy(roomName: string): EconomyMemory {
    if (!Memory.rooms[roomName]) {
        Memory.rooms[roomName] = {} as RoomMemory;
    }
    const room = Memory.rooms[roomName];
    if (!room.economy) {
        room.economy = {};
    }
    return room.economy;
}
