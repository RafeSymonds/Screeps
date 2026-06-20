/**
 * Empire-layer contracts. The empire is the thin allocation broker above the
 * per-room economy: it decides which home room owns which remote and the small
 * per-remote policy (active/reserve), then the per-room economy executes against
 * it. See docs/architecture/EMPIRE.md.
 */

/** One remote room assigned to a home room for mining. */
export interface RemotePlan {
    /** The remote (unowned) room. */
    roomName: string;
    /** The owning home room that funds its labor and reservation. */
    owner: string;
    /** Source ids in the remote (from intel) — the harvest jobs to generate. */
    sources: string[];
    /** Estimated tiles from the owner's storage to the remote (sizes haulers). */
    distance: number;
    /** Mining is on. False = paused (threat) — stops job generation + funding. */
    active: boolean;
    /** Whether to hold the controller reserved (10 e/tick vs 5). */
    reserve: boolean;
}

/** Top-level empire state (replaces the `Memory.empire?: unknown` placeholder). */
export interface EmpireMemory {
    /** Active remote assignments, keyed by remote room name. */
    remotes: Record<string, RemotePlan>;
    /** Game.time of the last allocation recompute (throttled). */
    lastPlanned?: number;
}
