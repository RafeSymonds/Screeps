import { SpawnRequest } from "spawn/types";
import { World } from "world/World";

/**
 * Expansion controller (seam). Hybrid command model: it will post claim/settle
 * SpawnRequests through the shared spawn service, then imperatively command its
 * claimers/settlers via commandExpansionCreep. No-op until built.
 */
export function planExpansion(_world: World): SpawnRequest[] {
    return [];
}

export function commandExpansionCreep(_creep: Creep, _world: World): void {
    // Reserved: imperative command of expansion-owned creeps.
}
