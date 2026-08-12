/**
 * Room lifecycle classification — pure. See docs/design/empire.md.
 *
 * One label per room, and it is the shared definition of "healthy" that expansion
 * gates on and aid routes by. Keeping it in one pure function is what stops five
 * subsystems from each inventing their own slightly different health check.
 *
 * Crippled specifically means "cannot fix itself": a room with no spawn cannot
 * build a spawn, which is the situation aid exists to solve.
 */
import { RoomSnapshot } from "shared/views";

export enum RoomLifecycle {
    Bootstrapping = "bootstrapping",
    Stable = "stable",
    Crippled = "crippled"
}

/**
 * ORDERED rules — the order IS the spec (a just-claimed room matches two of them,
 * which the first draft left ambiguous on M6's entire happy path):
 *  1. spawnless AND the active claim target → Bootstrapping (expansion owns it)
 *  2. spawnless → Crippled (the room that lost its spawn; aid's real customer)
 *  3. rcl < 2 with a thin roster → Bootstrapping
 *  4. no creeps AND drained → Crippled. The energy conjunct is what keeps a
 *     healthy room's 2-tick generation gap from misclassifying: spawn-side
 *     energy is full mid-turnover.
 *  5. Stable
 */
export function classify(room: RoomSnapshot, homedCreeps: number, claimTarget: string | undefined): RoomLifecycle {
    const spawns = room.structures[STRUCTURE_SPAWN]?.length ?? 0;
    if (spawns === 0) {
        return room.name === claimTarget ? RoomLifecycle.Bootstrapping : RoomLifecycle.Crippled;
    }
    if ((room.controller?.level ?? 0) < 2 && homedCreeps < 5) {
        return RoomLifecycle.Bootstrapping;
    }
    if (homedCreeps === 0 && room.energyAvailable < 300) {
        return RoomLifecycle.Crippled;
    }
    return RoomLifecycle.Stable;
}
