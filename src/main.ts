import { ErrorMapper } from "utils/ErrorMapper";
import { bootstrapMemory, cleanDeadCreeps } from "memory/bootstrap";
import { World } from "world/World";
import { JobBoard } from "jobs/JobBoard";
import { generateJobs } from "jobs/generators";
import { GreedyMatcher, economyCreepsToMatch } from "matching/Matcher";
import { SpawnManager } from "spawn/SpawnManager";
import { SpawnRequestQueue } from "spawn/queue";
import { runCreep } from "actions/executors";
import { assessDefense } from "defense/Defense";
import { runTowers } from "defense/Towers";
import { planBase } from "base/BasePlanner";
import { updateIntel } from "intel/Scouting";
import { planExpansion } from "expansion/Expansion";
import { planCombat } from "combat/Combat";
import { commandControllerCreeps } from "controllers";
import { shouldRun } from "cpu/Scheduler";
import { shouldGeneratePixel } from "cpu/CpuBudget";
import { BASE_INTERVAL, SCOUT_INTERVAL } from "config/constants";
import { Job } from "jobs/types";
import { SpawnRole } from "spawn/types";
import { RoomIntel } from "intel/types";
import { BasePlan } from "base/types";
import { DefenseState } from "defense/types";
import { warn } from "utils/logger";

declare global {
    interface Memory {
        version: number;
        jobs: Record<string, Job>;
        planRuns: Record<string, number>;
        empire?: unknown;
    }

    interface CreepMemory {
        /** Body/population tag set at spawn. NOT behavioral — matching is capability-based. */
        spawnRole: SpawnRole;
        /** Home room this creep belongs to. */
        home: string;
        /** Gather (false) vs act (true) phase used by sink executors. */
        working: boolean;
        /** Current sticky job assignment (economy creeps). */
        jobId?: string;
        /** If set, a subsystem controller commands this creep and matching skips it. */
        controller?: string;
    }

    interface RoomMemory {
        version?: number;
        intel?: RoomIntel;
        base?: BasePlan;
        defense?: DefenseState;
    }
}

// Stateless singletons; safe to persist across ticks and tolerate global resets.
const matcher = new GreedyMatcher();
const spawnManager = new SpawnManager();

/**
 * Run one pipeline phase, isolating its failures: a throw in one subsystem logs
 * and is swallowed so the rest of the tick (especially creep execution) still
 * runs. Persistent state is the JobBoard/Memory, so a skipped phase degrades
 * gracefully rather than freezing the whole bot.
 */
function guard(label: string, fn: () => void): void {
    try {
        fn();
    } catch (e) {
        warn(`phase ${label} failed: ${(e as Error).message ?? e}`);
    }
}

/**
 * Tick pipeline. Each numbered step maps to one architecture layer; layers
 * communicate only through the JobBoard and the SpawnRequestQueue.
 */
export const loop = ErrorMapper.wrapLoop(() => {
    // 1-2. Memory + dead creep hygiene.
    bootstrapMemory();
    const board = new JobBoard();
    board.rehydrate();
    cleanDeadCreeps();

    // 3. World read model.
    const world = new World();

    // 4. Scouting (throttled).
    if (shouldRun("scout", SCOUT_INTERVAL)) {
        guard("scout", () => updateIntel(world));
    }

    // 5. Strategy: planners post jobs and spawn requests.
    const spawnQueue = new SpawnRequestQueue();
    guard("defense", () => spawnQueue.pushAll(assessDefense(world)));
    guard("jobs", () => generateJobs(world, board));
    if (shouldRun("base", BASE_INTERVAL)) {
        guard("base", () => planBase(world));
    }
    guard("expansion", () => spawnQueue.pushAll(planExpansion(world)));
    guard("combat", () => spawnQueue.pushAll(planCombat(world)));

    // 6. Job bookkeeping.
    guard("reconcile", () => board.reconcile());
    guard("prune", () => board.prune(world));

    // 7. Spawn (demand + requests + floor).
    guard("spawn", () => spawnManager.run(world, board, spawnQueue));

    // 8. Matching (idle creeps + those that just finished a work cycle).
    guard("match", () => matcher.assign(economyCreepsToMatch(world, board), board, world));

    // 9. Tactical execution.
    guard("towers", () => runTowers(world));
    guard("controllers", () => commandControllerCreeps(world));
    for (const creep of world.creeps) {
        if (creep.spawning || creep.memory.controller) {
            continue;
        }
        guard(`run:${creep.name}`, () => runCreep(creep, board, world));
    }

    // 10. Persist jobs.
    board.persist();

    // 11. Opportunistic pixel generation.
    if (shouldGeneratePixel()) {
        Game.cpu.generatePixel();
    }
});
