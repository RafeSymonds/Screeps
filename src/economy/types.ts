/**
 * Contracts for the energy-flow spawning controller. The controller turns a
 * room's measured energy flow into three labor *targets*; the SpawnManager turns
 * the largest deficit into the next creep. See EnergyModel and
 * docs/architecture/ENERGY_FLOW_SPAWNING.md.
 */

/** Per-room persisted controller state: a smoothed storage integrator. */
export interface EconomyMemory {
    /** EMA of storage energy level — the buffer "fullness" signal. */
    storageEMA?: number;
    /** EMA of per-tick change in storage — >0 surplus, <0 deficit. */
    storageTrendEMA?: number;
    /** Last raw storage level, to derive the per-tick delta. */
    lastLevel?: number;
    /** Game.time of the last sense() update, for tick-delta-correct trend. */
    lastTick?: number;
}

/** The three flow stages population is sized to. Ordered by dependency. */
export enum LaborKind {
    /** WORK to saturate sources — income. */
    Miner = "miner",
    /** CARRY to move income to where it is spent — logistics. */
    Hauler = "hauler",
    /** WORK to spend delivered energy (build/upgrade) — consumption. */
    Consumer = "consumer"
}

/** A target amount of body parts for one flow stage, and the live supply of it. */
export interface LaborTarget {
    /** Parts needed to meet the flow (WORK for miner/consumer, CARRY for hauler). */
    target: number;
    /** Parts currently alive that serve this stage. */
    supply: number;
}

/** A room's full demand picture for one tick — targets plus the diagnostics that produced them. */
export interface RoomDemand {
    roomName: string;
    miner: LaborTarget;
    hauler: LaborTarget;
    consumer: LaborTarget;
    /** Measured income (e/tick), capped at source regen. */
    income: number;
    /** Undelivered energy (dropped + mining containers) — the under-haul signal. */
    backlog: number;
    /** Smoothed storage level (the consumer band gate). */
    storageLevel: number;
    /** Smoothed storage trend (surplus/deficit sign). */
    storageTrend: number;
}
