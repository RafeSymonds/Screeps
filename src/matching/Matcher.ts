import { JobBoard } from "jobs/JobBoard";
import { World } from "world/World";
import { canPerform } from "matching/capability";
import { score } from "matching/scoring";

/**
 * Strategy interface for assigning idle creeps to jobs. Swap the implementation
 * to change matching policy without touching jobs, spawning, or actions.
 */
export interface Matcher {
    assign(idleCreeps: Creep[], board: JobBoard, world: World): void;
}

/**
 * Greedy, capability-based matcher. For each idle creep, pick the highest-scoring
 * open job whose body requirements it satisfies. Sticky assignment is enforced by
 * the caller only passing in idle creeps.
 */
export class GreedyMatcher implements Matcher {
    public assign(idleCreeps: Creep[], board: JobBoard, world: World): void {
        const jobs = board.all();
        for (const creep of idleCreeps) {
            let best;
            let bestScore = -Infinity;
            for (const job of jobs) {
                if (!board.hasOpenSlot(job) || !canPerform(creep, job)) {
                    continue;
                }
                const value = score(creep, job);
                if (value > bestScore) {
                    bestScore = value;
                    best = job;
                }
            }
            if (best) {
                board.assign(creep.name, best.id);
            }
        }
    }
}

/**
 * Economy creeps eligible for (re)matching this tick: those not commanded by a
 * subsystem controller and not already holding a valid job assignment.
 */
export function idleEconomyCreeps(world: World, board: JobBoard): Creep[] {
    return world.creeps.filter(creep => {
        if (creep.spawning || creep.memory.controller) {
            return false;
        }
        const jobId = creep.memory.jobId;
        return !jobId || board.get(jobId) === undefined;
    });
}
