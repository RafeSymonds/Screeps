import { SpawnRequest } from "spawn/types";
import { World } from "world/World";

/**
 * Combat controller (seam). Hybrid command model: it will plan offensive
 * operations, post squad SpawnRequests through the shared spawn service, then
 * imperatively command soldiers in formation via commandCombatCreep. No-op until
 * built.
 */
export function planCombat(_world: World): SpawnRequest[] {
    return [];
}

export function commandCombatCreep(_creep: Creep, _world: World): void {
    // Reserved: imperative squad command of combat-owned creeps.
}
