/**
 * Core job contracts. A Job is a persistent unit of economic/build work with a
 * labor demand. Jobs are produced by generators, persisted in Memory.jobs, and
 * consumed by matching (who does it) and spawning (how much labor to make).
 */

/** String-valued so it serializes to the same token persisted in `Memory.jobs`. */
export enum JobKind {
    Harvest = "harvest",
    Haul = "haul",
    Upgrade = "upgrade",
    Build = "build",
    Repair = "repair"
}

/** Live game objects a job can target — all have an id and a position. */
export type JobTarget = Structure | Source | ConstructionSite | StructureController;

/** Body-part labor a single creep slot on this job ideally contributes. */
export interface JobDemand {
    work: number;
    carry: number;
    move?: number;
    attack?: number;
    heal?: number;
    claim?: number;
}

export interface SerializedPos {
    x: number;
    y: number;
    roomName: string;
}

export interface Job {
    /** Deterministic id (e.g. `harvest:<sourceId>`) so re-generation upserts in place. */
    id: string;
    kind: JobKind;
    roomName: string;
    targetId?: string;
    pos?: SerializedPos;
    /** Max creeps that can be assigned at once. */
    capacity: number;
    /** Creep names currently assigned. */
    assigned: string[];
    /** Higher = preferred by matching and weighted higher for spawn demand. */
    priority: number;
    demand: JobDemand;
    /** Kind-specific extras (e.g. haul: { fromId, toId }). */
    data?: Record<string, unknown>;
}
