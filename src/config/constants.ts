/**
 * Central tunables for the whole AI. Keeping these in one place makes each
 * subsystem easy to tune in isolation without hunting through logic files.
 */

import { JobKind } from "jobs/types";

// --- Memory ---
export const MEMORY_VERSION = 1;

// --- CPU bucket tiers ---
export const CPU_BUCKET_CRITICAL = 1000;
export const CPU_BUCKET_LOW = 3000;
export const CPU_BUCKET_HIGH = 9000;
export const PIXEL_BUCKET = 10000;

// --- Scheduler intervals (ticks) ---
export const SCOUT_INTERVAL = 10;
export const BASE_INTERVAL = 25;

// --- Job priorities (higher = matched/staffed first) ---
export const JOB_PRIORITY: Record<JobKind, number> = {
    [JobKind.Harvest]: 80,
    [JobKind.Haul]: 70,
    [JobKind.Build]: 60,
    [JobKind.Repair]: 50,
    [JobKind.Upgrade]: 40
};

// SpawnRequests from controller subsystems outrank economy demand.
export const DEFENSE_REQUEST_PRIORITY = 200;

// --- Spawning ---
export const MAX_ROOM_POPULATION = 12;
export const BODY_MAX_PARTS = 50;
// Below this energy capacity we stay on cheap generalists; above it we may specialize.
export const SPECIALIZE_ENERGY = 550;
// Energy capacity at which a dedicated static miner becomes worthwhile (affords a
// ~[WORK,WORK,MOVE] miner). Drop-mining needs no container, so we specialize this
// early and let speed/income come first; containers are an optimization later.
export const MIN_MINER_ENERGY = 250;
// WORK+CARRY flex workers kept for build/upgrade — pure miners (no CARRY) and
// haulers (no WORK) can do neither, so the base composition must include these.
export const FLEX_WORKERS = 2;
// Minimum energy to bank before spawning a non-emergency economy creep.
export const MIN_SPAWN_ENERGY = 300;

// --- Economy: energy-flow-driven spawning ---
// Population is an OUTPUT of a per-room flow model, not a fixed composition. See
// docs/architecture/ENERGY_FLOW_SPAWNING.md and src/economy/EnergyModel.ts.
// A source regenerates SOURCE_ENERGY_CAPACITY/ENERGY_REGEN_TIME = 10 e/tick; at
// HARVEST_POWER 2 that is 5 WORK to fully drain it. More WORK mines nothing.
export const MINER_WORK_PER_SOURCE = 5;
// Hauler CARRY target ≈ income × tripFactor × distance / CARRY_CAPACITY. The trip
// factor is the round-trip (loaded out, empty back) cost per tile; ~3 off-road
// for a 1:1 CARRY:MOVE hauler, ~1.5 on roads.
export const ECONOMY_HAUL_TRIP_FACTOR = 3;
// Undelivered energy (dropped + mining-container fill) above which the room is
// under-hauled; adds a flat CARRY bump so logistics catches up to income.
export const ECONOMY_BACKLOG_THRESHOLD = 1000;
export const ECONOMY_BACKLOG_CARRY_BONUS = 4;
// Fraction of a consumer's life actually spent upgrading/building (the rest is
// fetching energy); used to size consumer WORK to the surplus it must burn.
export const CONSUMER_EFFICIENCY = 0.6;
// Always keep a little upgrade pressure so the controller never downgrades, and
// cap surplus-chasing so a rich room can't spawn an unbounded upgrader swarm.
export const ECONOMY_MIN_CONSUMER_WORK = 1;
export const ECONOMY_MAX_CONSUMER_WORK = 30;
// Storage buffer band (absolute energy). Below floor: hoard (route nothing to
// upgrade). Between floor and target: build the buffer, upgrade modestly. Above
// target with a non-negative trend: spend the full surplus on upgrade.
export const ECONOMY_STORAGE_FLOOR = 10000;
export const ECONOMY_STORAGE_TARGET = 30000;
// Storage EMA smoothing (level + per-tick trend). ~0.05 ≈ a few-hundred-tick
// window — long enough to ignore spawn-cycle noise, short enough to react.
export const ECONOMY_EMA_ALPHA = 0.05;

// --- Base planning ---
export const MAX_SITES_PER_RUN = 3;
export const EXTENSION_PLAN_RADIUS = 6;
export const SOURCE_CONTAINER_RANGE = 2;
// Roads get their own per-run site budget so they never starve extension growth.
export const MAX_ROAD_SITES_PER_RUN = 2;
// Don't plan roads until the room can sustain the build/repair cost.
export const ROAD_PLAN_MIN_RCL = 3;
// Storage unlocks at RCL4; place it once the controller allows it.
export const STORAGE_MIN_RCL = 4;

// --- Repair ---
// Repair non-fortification structures (roads/containers) below this fraction of max hits.
export const REPAIR_THRESHOLD = 0.6;

// --- Towers ---
// Repair non-fortification structures below this fraction of max hits.
export const TOWER_REPAIR_THRESHOLD = 0.5;
// Don't drain towers below this for repairs (keep energy for defense).
export const TOWER_MIN_ENERGY_TO_REPAIR = 400;

// --- Logistics (energy source/sink + build-target scoring) ---
// Selection is argmax(value − distance·weight): distance is one term in a
// blended score, not a hard gate. DIST_WEIGHT is how many value-points one tile
// of travel costs — the master knob for "how much does closeness matter".
export const LOGISTICS_DIST_WEIGHT = 4;

// Source values (where a creep draws energy). Containers are buffers meant to be
// drained; storage is the strategic reserve (last resort); spawns/extensions are
// never sources. Dropped energy decays, so it gets an amount-scaled bonus
// (bigger/older piles are more urgent to clear), capped so it can't dominate.
export const LOGISTICS_SOURCE_DROPPED = 100;
export const LOGISTICS_SOURCE_CONTAINER = 80;
export const LOGISTICS_SOURCE_STORAGE = 20;
export const LOGISTICS_DROPPED_AMOUNT_WEIGHT = 0.02;
export const LOGISTICS_DROPPED_AMOUNT_CAP = 30;

// Sink values (where a creep delivers). An empty spawn blocks spawning; an empty
// tower is a defense hole (urgent while hostiles are present); extensions matter
// only in aggregate. FILL_URGENCY scales each by how empty it is (free/capacity).
export const LOGISTICS_SINK_SPAWN = 90;
export const LOGISTICS_SINK_TOWER = 60;
export const LOGISTICS_SINK_EXTENSION = 50;
export const LOGISTICS_SINK_FILL_URGENCY = 40;
export const LOGISTICS_TOWER_COMBAT_MULT = 3;

// Build target values. Type dominates (finish economy/defense before roads), then
// near-complete sites (don't spread thin), then proximity. PRIORITY_SCALE lifts
// the type tier strictly above the progress/distance terms.
export const LOGISTICS_BUILD_PRIORITY: Record<string, number> = {
    [STRUCTURE_SPAWN]: 100,
    [STRUCTURE_TOWER]: 90,
    [STRUCTURE_EXTENSION]: 80,
    [STRUCTURE_CONTAINER]: 70,
    [STRUCTURE_STORAGE]: 70,
    [STRUCTURE_LINK]: 60,
    [STRUCTURE_RAMPART]: 40,
    [STRUCTURE_WALL]: 30,
    [STRUCTURE_ROAD]: 20
};
export const LOGISTICS_BUILD_DEFAULT_PRIORITY = 50;
export const LOGISTICS_BUILD_PRIORITY_SCALE = 100;
export const LOGISTICS_BUILD_PROGRESS_WEIGHT = 50;
