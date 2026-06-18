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
// Minimum energy to bank before spawning a non-emergency economy creep.
export const MIN_SPAWN_ENERGY = 300;

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
