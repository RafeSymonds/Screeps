import { JobBoard } from "jobs/JobBoard";
import { Job } from "jobs/types";
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
 * Capability-based, balance-first matcher. Each idle creep is assigned to the
 * eligible open job with the FEWEST creeps already on it, breaking ties by
 * priority and then by proximity (score).
 *
 * Why least-staffed and not pure priority: creeps spawn one at a time and hold
 * their job stickily, so each match call usually sees a single idle creep. A
 * pure highest-priority rule then pours every trickled creep into harvest (6
 * slots) + haul (2) + build (2) before upgrade's slots are ever reached, so the
 * controller is never staffed until population tops ~10. Balancing by current
 * staffing instead spreads one creep to each job first — harvest, harvest, haul,
 * build, upgrade — so building and upgrading start at low population while the
 * top-priority job is still filled first when everything is empty.
 */
export class GreedyMatcher implements Matcher {
    public assign(creeps: Creep[], board: JobBoard, _world: World): void {
        const jobs = board.all();
        for (const creep of creeps) {
            const candidate = bestJobFor(creep, jobs, board);
            if (!candidate) {
                continue;
            }
            const current = creep.memory.jobId ? board.get(creep.memory.jobId) : undefined;
            if (!current) {
                // First assignment (or the old job vanished): just take the best job.
                board.assign(creep.name, candidate.id);
            } else if (candidate.id !== current.id && candidate.assigned.length < current.assigned.length) {
                // Re-decide at the cycle boundary: move only to a strictly LESS-staffed
                // job. Below full coverage this rotates a freed creep onto whatever job
                // is currently uncovered (so upgrade/build get worked); at or above
                // coverage every job is level, nothing is strictly less, so creeps stay
                // put and there is no churn.
                board.unassignCreep(creep.name);
                board.assign(creep.name, candidate.id);
            }
        }
    }
}

/**
 * Pick the eligible open job for `creep` minimizing current staffing, then
 * maximizing priority, then proximity. Returns undefined if none fits.
 */
function bestJobFor(creep: Creep, jobs: Job[], board: JobBoard): Job | undefined {
    let best: Job | undefined;
    let bestLevel = Infinity;
    let bestPriority = -Infinity;
    let bestScore = -Infinity;
    for (const job of jobs) {
        if (!board.hasOpenSlot(job) || !canPerform(creep, job)) {
            continue;
        }
        const level = job.assigned.length;
        const value = score(creep, job);
        const better =
            level < bestLevel ||
            (level === bestLevel && job.priority > bestPriority) ||
            (level === bestLevel && job.priority === bestPriority && value > bestScore);
        if (better) {
            best = job;
            bestLevel = level;
            bestPriority = job.priority;
            bestScore = value;
        }
    }
    return best;
}

/**
 * Economy creeps eligible for (re)matching this tick. A creep is considered when
 * it is not commanded by a subsystem controller AND either:
 *   - it has no valid job assignment (new creep, or its job was pruned), or
 *   - it just finished a work cycle, i.e. it ran out of energy (`working` but the
 *     store is empty). This is the natural re-decision point: rather than holding
 *     one job for life or re-evaluating every tick, a creep reconsiders what work
 *     is most needed each time it empties out and is about to gather again.
 */
export function economyCreepsToMatch(world: World, board: JobBoard): Creep[] {
    return world.creeps.filter(creep => {
        if (creep.spawning || creep.memory.controller) {
            return false;
        }
        const jobId = creep.memory.jobId;
        if (!jobId || board.get(jobId) === undefined) {
            return true;
        }
        return finishedWorkCycle(creep);
    });
}

/** True the tick a creep empties out at the end of its work phase. */
function finishedWorkCycle(creep: Creep): boolean {
    return creep.memory.working === true && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0;
}
