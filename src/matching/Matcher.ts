import { JobBoard } from "jobs/JobBoard";
import { Job, JobKind } from "jobs/types";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
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
 * Capability + NEED matcher. A creep is matched to a job only if it both *can*
 * do it (`canPerform`) and the job is actually *needed* right now (`jobNeeded`).
 * Among eligible jobs it picks the least-staffed, then highest-priority, then
 * nearest.
 *
 * Need is what makes mining a last resort: a creep with CARRY can grab energy
 * that already exists (dropped/containers/storage), so for it `harvest` is
 * "needed" only when there is nothing to collect — at bootstrap that's true
 * (nobody's mined yet, so it mines and feeds the spawn); once miners produce
 * piles it becomes false and flex creeps move to hauling/upgrading. Symmetrically,
 * `haul` is only "needed" when there is energy to move. A pure miner (no CARRY)
 * can only mine, so harvest is always needed by it — this never gates it.
 *
 * Need is read from the BODY (does it have CARRY?), not the `spawnRole` tag, per
 * the capability-based-assignment guardrail.
 */
export class GreedyMatcher implements Matcher {
    public assign(creeps: Creep[], board: JobBoard, world: World): void {
        const jobs = board.all();
        for (const creep of creeps) {
            const candidate = bestJobFor(creep, jobs, board, world);
            const current = creep.memory.jobId ? board.get(creep.memory.jobId) : undefined;

            if (!current) {
                // No (valid) job: take the best one if there is one.
                if (candidate) {
                    board.assign(creep.name, candidate.id);
                }
                continue;
            }

            // Drop a job the creep should no longer be doing (capability lost, or
            // the work is no longer needed — e.g. mining once energy is available).
            const currentOk = jobEligible(creep, current, world);
            if (!candidate) {
                if (!currentOk) {
                    board.unassignCreep(creep.name);
                }
                continue;
            }
            if (candidate.id === current.id) {
                continue;
            }

            // Switch when the current job is no longer a fit, or to a strictly
            // less-staffed job — counting the current job WITHOUT this creep, so a
            // creep never ping-pongs between two equally-empty jobs (the self count
            // would otherwise always make "the other" look one lighter).
            const move = !currentOk || candidate.assigned.length < current.assigned.length - 1;
            if (move) {
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
function bestJobFor(creep: Creep, jobs: Job[], board: JobBoard, world: World): Job | undefined {
    let best: Job | undefined;
    let bestLevel = Infinity;
    let bestPriority = -Infinity;
    let bestScore = -Infinity;
    for (const job of jobs) {
        if (!board.hasOpenSlot(job) || !jobEligible(creep, job, world)) {
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

/** A creep may take a job only if it can perform it AND the job is needed now. */
function jobEligible(creep: Creep, job: Job, world: World): boolean {
    return canPerform(creep, job) && jobNeeded(creep, job, world);
}

/**
 * Whether `job` is worth doing for `creep` given current room state — the "need"
 * half of matching. Most kinds are always needed (build/repair only exist while
 * there is work; upgrade is the elastic sink). The exceptions encode "don't mine
 * when you could just collect":
 *   - Harvest: a creep that can collect (has CARRY) mines only when there is no
 *     collectable energy; a pure miner (no CARRY) always mines.
 *   - Haul: only needed when there is energy to move.
 */
function jobNeeded(creep: Creep, job: Job, world: World): boolean {
    if (job.kind !== JobKind.Harvest && job.kind !== JobKind.Haul) {
        return true;
    }
    const room = world.getRoom(job.roomName);
    if (!room) {
        return true; // stale room — don't second-guess
    }
    const collectable = hasCollectableEnergy(room);
    if (job.kind === JobKind.Harvest) {
        // A pure miner (no CARRY) can only mine; a creep with CARRY should collect
        // existing energy first and mine only as a last resort.
        return creep.getActiveBodyparts(CARRY) === 0 || !collectable;
    }
    // Haul
    return collectable;
}

/** Energy a creep could pick up instead of mining: dropped, containers, storage. */
function hasCollectableEnergy(room: WorldRoom): boolean {
    return room.droppedEnergy.length > 0 || room.energyStores().length > 0;
}

/**
 * Economy creeps eligible for (re)matching this tick: those not commanded by a
 * subsystem controller that either have no valid job, or are EMPTY. An empty
 * creep is about to gather, so it is the natural point to reconsider what is most
 * needed (e.g. a generalist that was mining can switch to collecting once energy
 * has appeared). Creeps carrying energy keep their job until delivered, so this
 * does not interrupt work in progress. The matcher's switch rule keeps churn low.
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
        return creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0;
    });
}
