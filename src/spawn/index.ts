/**
 * Spawn adapter: filters the tick's demands to this room, resolves, executes
 * spawnCreep — the one moment spawn writes creep memory. See docs/design/spawn.md.
 */
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { RoomSnapshot } from "shared/views";
import { resolve } from "snapshot/handles";
import { log } from "telemetry/index";
import { resolveSpawns } from "spawn/resolver";

/** The class-B perRoom entry, after economy in the normative order. */
export function runRoom(ctx: TickContext, room: RoomSnapshot): void {
    const demands = ctx.spawnDemands.filter(d => d.home === room.name);
    const decisions = resolveSpawns(demands, room, ctx.snapshot.time);
    for (const decision of decisions) {
        const spawn = resolve(decision.spawnId);
        if (!spawn) {
            continue;
        }
        const rc = spawn.spawnCreep(decision.body, decision.name, {
            memory: {
                home: decision.demand.home,
                owner: decision.demand.owner,
                assignment: decision.demand.assignment
            } as CreepMemory
        });
        if (rc !== OK) {
            log.warn(SubsystemId.Spawn, () => `spawnCreep ${decision.name} failed: ${rc}`);
        }
    }
}
