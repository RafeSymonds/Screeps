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
 * Capability-gated, need-preferring matcher. Capability (`canPerform`) is the
 * ONLY hard gate: a creep is always allowed to do any open job its body supports,
 * so it is never left idle while work it can do sits open. On top of that, jobs are
 * ranked needed-first, then by the PRIORITY LADDER (harvest > haul > build > repair
 * > upgrade), then fewest-assigned, then proximity. Because priority outranks
 * staffing, the bounded needs fill to capacity before anyone falls to the bottom
 * rung — upgrade — whose capacity is sized to soak the whole room, making it the
 * residual sink: "don't upgrade until everything else is consumed."
 *
 * Need is what makes mining a last resort: a creep with CARRY can grab energy
 * that already exists (dropped/containers/storage), so for it `harvest` is
 * "needed" only when there is nothing to collect; once piles appear it prefers
 * hauling/building/upgrading. Symmetrically `haul` is preferred only when there is
 * energy to move. A pure miner (no CARRY) can only mine, so harvest is always needed
 * by it. Crucially this is a tiebreak, not a veto: when collection slots are full a
 * carrier still takes an open harvest job and mines rather than standing idle.
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

            // Keep the current job unless the creep can no longer perform it. Never
            // drop a doable job to nothing just because it is momentarily un-preferred
            // (that is the idle bug): without an alternative, staying and working beats
            // standing still.
            if (!candidate) {
                if (!canPerform(creep, current)) {
                    board.unassignCreep(creep.name);
                }
                continue;
            }
            if (candidate.id === current.id) {
                continue;
            }

            if (shouldSwitch(creep, current, candidate, world)) {
                board.unassignCreep(creep.name);
                board.assign(creep.name, candidate.id);
            }
        }
    }
}

/**
 * Whether `creep` should move off `current` onto `candidate`. Move when: the creep
 * can no longer perform the current job; or the candidate is needed work while the
 * current no longer is (leave mining for collection, etc.); or — both needed — the
 * candidate sits HIGHER on the priority ladder (climb toward the bounded needs, off
 * residual upgrade); or, at equal priority, the candidate is strictly less-staffed
 * (counting the current job WITHOUT this creep, so a creep never ping-pongs between
 * two equally-empty jobs). Never leave needed work for un-needed work, and never
 * thrash between two un-needed jobs.
 */
function shouldSwitch(creep: Creep, current: Job, candidate: Job, world: World): boolean {
    if (!canPerform(creep, current)) {
        return true;
    }
    // The current job left this creep's room scope (e.g. its remote was abandoned
    // and targetRoom cleared) — move to the in-scope candidate.
    if (!jobInScope(creep, current)) {
        return true;
    }
    const currentNeeded = jobNeeded(creep, current, world);
    const candidateNeeded = jobNeeded(creep, candidate, world);
    if (candidateNeeded !== currentNeeded) {
        return candidateNeeded;
    }
    if (!candidateNeeded) {
        return false;
    }
    if (candidate.priority !== current.priority) {
        return candidate.priority > current.priority;
    }
    return candidate.assigned.length < current.assigned.length - 1;
}

/**
 * Pick the best open job `creep` can perform. Capability is the only hard gate;
 * among the jobs it can do, rank by: needed-first (the soft preference), then
 * highest PRIORITY, then fewest creeps already on it, then proximity.
 *
 * Priority outranks staffing on purpose — it is what makes the job priorities a
 * real ladder (harvest 80 > haul 70 > build 60 > repair 50 > upgrade 40) instead
 * of a tiebreak. A creep fills the highest-priority job that still has an open slot,
 * so the bounded needs (mine, haul, refill, build, repair) staff to capacity before
 * anyone drops to the lowest rung, upgrade. With upgrade's capacity sized to absorb
 * the whole room, it becomes the RESIDUAL sink: only the labor nothing higher needs
 * ends up upgrading. (Earlier this was fewest-assigned-first, which let upgrade —
 * the least-staffed job at RCL2 — steal creeps from build, so extensions never
 * finished and the room never reached the specialize threshold.) Returns undefined
 * only when there is no open job the creep is capable of at all.
 */
function bestJobFor(creep: Creep, jobs: Job[], board: JobBoard, world: World): Job | undefined {
    let best: Job | undefined;
    let bestNeeded = -1;
    let bestPriority = -Infinity;
    let bestLevel = Infinity;
    let bestScore = -Infinity;
    for (const job of jobs) {
        if (!board.hasOpenSlot(job) || !canPerform(creep, job) || !jobInScope(creep, job)) {
            continue;
        }
        const needed = jobNeeded(creep, job, world) ? 1 : 0;
        const level = job.assigned.length;
        const value = score(creep, job);
        const better =
            needed > bestNeeded ||
            (needed === bestNeeded &&
                (job.priority > bestPriority ||
                    (job.priority === bestPriority && level < bestLevel) ||
                    (job.priority === bestPriority && level === bestLevel && value > bestScore)));
        if (better) {
            best = job;
            bestNeeded = needed;
            bestPriority = job.priority;
            bestLevel = level;
            bestScore = value;
        }
    }
    return best;
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
 * A creep works in exactly one room: its `targetRoom` if set (remote-mining
 * creeps), else its `home`. The matcher only offers it jobs in that room — this
 * pins remote miners/haulers to their remote (an empty remote hauler can't be
 * poached onto a closer home job when it re-decides) and keeps home creeps from
 * wandering out to remotes. Permissive when neither field is set (the scope is
 * undefined), since unit-test creeps omit them and production creeps always carry
 * a `home` via ensureCreepMemory.
 */
function jobInScope(creep: Creep, job: Job): boolean {
    const scope = creep.memory.targetRoom ?? creep.memory.home;
    return scope === undefined || job.roomName === scope;
}

/**
 * Economy creeps eligible for (re)matching this tick: those not commanded by a
 * subsystem controller that either have no valid job, or are EMPTY. An empty
 * creep is about to gather, so it is the natural point to reconsider what is most
 * needed (e.g. a worker that was mining can switch to collecting once energy has
 * appeared). Creeps carrying energy keep their job until delivered, so this
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
