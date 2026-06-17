/**
 * Spawn-side contracts. SpawnRole is a body/population tag ONLY — it never gates
 * behavior (matching is capability-based). SpawnRequest is how controller
 * subsystems (defense/combat/expansion) ask for a creep through the shared
 * spawn service.
 */

export type SpawnRole = "generalist" | "miner" | "hauler" | "worker" | "defender" | "claimer" | "soldier";

export interface SpawnRequest {
    /** Stable key so a subsystem can avoid duplicate requests across ticks. */
    key: string;
    roomName: string;
    role: SpawnRole;
    priority: number;
    /** Optional explicit body; if omitted SpawnManager sizes one for the role. */
    body?: BodyPartConstant[];
    /** Controller tag written to creep.memory.controller (skips the matcher). */
    owner?: string;
}
