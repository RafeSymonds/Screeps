import { Job, JobTarget } from "jobs/types";

/**
 * Scores a (creep, job) pairing for the matcher. Higher is better. Default
 * heuristic: job priority, minus a range penalty, minus a penalty for working
 * away from home. Swap this module to change matching behavior.
 */
export function score(creep: Creep, job: Job): number {
    let value = job.priority;

    const pos = jobPosition(job);
    if (pos && pos.roomName === creep.pos.roomName) {
        value -= creep.pos.getRangeTo(pos) * 0.5;
    }
    if (creep.memory.home && job.roomName !== creep.memory.home) {
        value -= 50;
    }
    return value;
}

function jobPosition(job: Job): RoomPosition | undefined {
    if (job.targetId) {
        const target = Game.getObjectById(job.targetId as Id<JobTarget>);
        if (target) {
            return target.pos;
        }
    }
    if (job.pos) {
        return new RoomPosition(job.pos.x, job.pos.y, job.pos.roomName);
    }
    return undefined;
}
