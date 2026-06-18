import { Job, JobDemand, JobKind, JobTarget } from "jobs/types";
import { World } from "world/World";

/**
 * In-memory index over Memory.jobs. Single source of truth for "what work
 * exists". Knows nothing about how jobs execute or how creeps are spawned — it
 * only stores jobs, tracks assignments, and aggregates demand.
 */
export class JobBoard {
    private jobs: Map<string, Job>;

    public constructor() {
        this.jobs = new Map();
    }

    public rehydrate(): void {
        this.jobs = new Map();
        for (const id in Memory.jobs) {
            this.jobs.set(id, Memory.jobs[id]);
        }
    }

    public persist(): void {
        const out: Record<string, Job> = {};
        for (const [id, job] of this.jobs) {
            out[id] = job;
        }
        Memory.jobs = out;
    }

    /**
     * Create or update a job by its deterministic id. Preserves the existing
     * `assigned` list so re-generation never drops sticky assignments.
     */
    public upsert(job: Job): Job {
        const existing = this.jobs.get(job.id);
        if (existing) {
            existing.kind = job.kind;
            existing.roomName = job.roomName;
            existing.targetId = job.targetId;
            existing.pos = job.pos;
            existing.capacity = job.capacity;
            existing.priority = job.priority;
            existing.demand = job.demand;
            existing.data = job.data;
            return existing;
        }
        this.jobs.set(job.id, job);
        return job;
    }

    public get(id: string): Job | undefined {
        return this.jobs.get(id);
    }

    public all(): Job[] {
        return [...this.jobs.values()];
    }

    public byRoom(roomName: string): Job[] {
        return this.all().filter(job => job.roomName === roomName);
    }

    public hasOpenSlot(job: Job): boolean {
        return job.assigned.length < job.capacity;
    }

    public remove(id: string): void {
        const job = this.jobs.get(id);
        if (!job) {
            return;
        }
        for (const name of job.assigned) {
            const mem = Memory.creeps[name];
            if (mem && mem.jobId === id) {
                delete mem.jobId;
            }
        }
        this.jobs.delete(id);
    }

    /** Assign a creep to a job if there is an open slot. Writes creep.memory.jobId. */
    public assign(creepName: string, jobId: string): boolean {
        const job = this.jobs.get(jobId);
        if (!job || !this.hasOpenSlot(job)) {
            return false;
        }
        if (!job.assigned.includes(creepName)) {
            job.assigned.push(creepName);
        }
        const mem = Memory.creeps[creepName];
        if (mem) {
            mem.jobId = jobId;
        }
        return true;
    }

    public unassignCreep(creepName: string): void {
        const mem = Memory.creeps[creepName];
        const jobId = mem?.jobId;
        if (!jobId) {
            return;
        }
        const job = this.jobs.get(jobId);
        if (job) {
            job.assigned = job.assigned.filter(name => name !== creepName);
        }
        delete mem!.jobId;
    }

    /**
     * Drop assignments that are no longer consistent: dead creeps, or creeps
     * whose memory no longer points back at this job. Keeps assigned lists honest
     * for sticky matching.
     */
    public reconcile(): void {
        for (const job of this.jobs.values()) {
            job.assigned = job.assigned.filter(name => {
                const mem = Memory.creeps[name];
                return name in Game.creeps && mem !== undefined && mem.jobId === job.id;
            });
        }
    }

    /** Remove jobs whose target/condition is no longer valid. */
    public prune(world: World): void {
        for (const job of [...this.jobs.values()]) {
            if (!isJobValid(job, world)) {
                this.remove(job.id);
            }
        }
    }

    /** Aggregate unmet labor demand for a room (open slots × per-slot demand). */
    public demand(roomName: string): JobDemand {
        const total: JobDemand = { work: 0, carry: 0 };
        for (const job of this.byRoom(roomName)) {
            const open = job.capacity - job.assigned.length;
            if (open <= 0) {
                continue;
            }
            total.work += (job.demand.work ?? 0) * open;
            total.carry += (job.demand.carry ?? 0) * open;
        }
        return total;
    }

    /** Count of open assignment slots per kind for a room. */
    public openByKind(roomName: string): Record<string, number> {
        const out: Record<string, number> = {};
        for (const job of this.byRoom(roomName)) {
            const open = Math.max(0, job.capacity - job.assigned.length);
            out[job.kind] = (out[job.kind] ?? 0) + open;
        }
        return out;
    }
}

/**
 * A job is valid while its target still exists. If the target's room is not
 * visible we keep the job (tolerate staleness); if it is visible and the target
 * is gone (built site, depleted) the job is pruned.
 */
export function isJobValid(job: Job, world: World): boolean {
    const roomVisible = world.getRoom(job.roomName) !== undefined;

    if (job.targetId) {
        const target = Game.getObjectById(job.targetId as Id<JobTarget>);
        if (!target) {
            return !roomVisible;
        }
    }

    // Build jobs are room-level (no targetId): valid only while sites remain.
    if (job.kind === JobKind.Build && roomVisible) {
        const worldRoom = world.getRoom(job.roomName);
        return (worldRoom?.constructionSites.length ?? 0) > 0;
    }

    // Repair jobs are room-level: valid only while damaged structures remain.
    if (job.kind === JobKind.Repair && roomVisible) {
        const worldRoom = world.getRoom(job.roomName);
        return (worldRoom?.repairTargets().length ?? 0) > 0;
    }

    return true;
}
