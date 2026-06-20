/**
 * Spawn-side contracts. SpawnRole is a body/population tag ONLY — it never gates
 * behavior (matching is capability-based). SpawnRequest is how controller
 * subsystems (defense/combat/expansion) ask for a creep through the shared
 * spawn service.
 */

/**
 * String-valued so it serializes to the same token persisted in `CreepMemory.spawnRole`.
 *
 * The tag is a BODY TEMPLATE selector only — it never drives behavior (matching is
 * capability-based) and no longer drives flow accounting (the EnergyModel gauges
 * supply from body shape; see `laborByKind`). `Worker` is the single WORK+CARRY
 * body: the bootstrap "do everything" creep AND the mature upgrader/builder are one
 * and the same. `Miner` (WORK-only) and `Hauler` (CARRY-only) are the specialized
 * shapes the model wants once a room can afford them.
 */
export enum SpawnRole {
    Miner = "miner",
    Hauler = "hauler",
    Worker = "worker",
    Defender = "defender",
    Claimer = "claimer",
    Soldier = "soldier",
    /** Single MOVE body that gains vision of neighbors for the empire layer. */
    Scout = "scout"
}

export interface SpawnRequest {
    /** Stable key so a subsystem can avoid duplicate requests across ticks. */
    key: string;
    /** Room whose spawn fulfills the request (the creep's `home`). */
    roomName: string;
    role: SpawnRole;
    priority: number;
    /** Optional explicit body; if omitted SpawnManager sizes one for the role. */
    body?: BodyPartConstant[];
    /** Controller tag written to creep.memory.controller (skips the matcher). */
    owner?: string;
    /** Room the creep operates in if different from `roomName` (remote/cross-room
     *  creeps). Written to creep.memory.targetRoom. */
    targetRoom?: string;
}
