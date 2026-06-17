import { Job, JobKind } from "jobs/types";

/**
 * Capability gate: which body parts a creep must have to perform a job kind.
 * This is the ONLY thing that decides if a creep can do a job — there is no
 * behavioral role. Adding a job kind adds one entry here.
 */
const REQUIRED_PARTS: Record<JobKind, BodyPartConstant[]> = {
    harvest: [WORK],
    haul: [CARRY],
    upgrade: [WORK, CARRY],
    build: [WORK, CARRY]
};

export function canPerform(creep: Creep, job: Job): boolean {
    const required = REQUIRED_PARTS[job.kind];
    return required.every(part => creep.getActiveBodyparts(part) > 0);
}
