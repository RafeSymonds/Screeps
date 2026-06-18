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
 * next (largest deficit, upstream stages first); `senseEconomy` keeps the storage
 * integrator fresh each tick. SpawnManager maps the chosen stage to a body.
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
    MINER_WORK_PER_SOURCE
} from "config/constants";
import { EconomyMemory, LaborKind, LaborTarget, RoomDemand } from "economy/types";
import { SpawnRole } from "spawn/types";
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

    const supply = laborByKind(world.creepsForRoom(worldRoom.name));

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
 * Choose which flow stage to fund next, or null if all targets are met. The
 * largest positive deficit (ratio) wins; ties break toward upstream stages (mine
 * before haul before spend) via the listing order below.
 *
 * Note this self-orders WITHOUT a hard "income first" gate: the hauler and
 * consumer targets are themselves income-derived, so when income is low their
 * targets — and thus their deficits — are small and the large miner deficit
 * wins; as income rises the downstream deficits grow and get funded. A hard gate
 * here instead starves logistics/consumption whenever miners are energy-limited
 * (low-RCL miners carry few WORK, so a parts-based gate never clears).
 */
export function pickDeficitRole(demand: RoomDemand): LaborKind | null {
    const ranked: Array<[LaborKind, number]> = [
        [LaborKind.Miner, deficit(demand.miner)],
        [LaborKind.Hauler, deficit(demand.hauler)],
        [LaborKind.Consumer, deficit(demand.consumer)]
    ];
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
 * Bucket live body parts by the stage they serve. Dedicated bodies serve one
 * stage (miner = WORK, hauler = CARRY, worker = consumer WORK); a generalist is
 * the universal bootstrap body and counts toward all three. Role tags express
 * intent — the capability matcher then routes each body to matching jobs.
 */
function laborByKind(creeps: Creep[]): LaborByKind {
    const labor: LaborByKind = { minerWork: 0, haulerCarry: 0, consumerWork: 0 };
    for (const creep of creeps) {
        const work = creep.getActiveBodyparts(WORK);
        const carry = creep.getActiveBodyparts(CARRY);
        const role = creep.memory.spawnRole;
        const generalist = role === SpawnRole.Generalist;
        if (generalist || role === SpawnRole.Miner) {
            labor.minerWork += work;
        }
        if (generalist || role === SpawnRole.Hauler) {
            labor.haulerCarry += carry;
        }
        if (generalist || role === SpawnRole.Worker) {
            labor.consumerWork += work;
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
