/**
 * Spawn adapter: filters the tick's demands to this room, resolves, executes
 * spawnCreep — the one moment spawn writes creep memory. See docs/design/spawn.md.
 */
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { RoomSnapshot } from "shared/views";
import { resolve } from "snapshot/handles";
import { log } from "telemetry/index";
import { resolveSpawns, SpawnState } from "spawn/resolver";

/** Owner of Memory.rooms[name].spawn — the queue's wait record, which is the one
 *  piece of spawn state that cannot be re-derived (how long we have been holding
 *  the line for an unaffordable demand). */
export interface SpawnMemory extends SpawnState {
    v: 1;
}

function sliceOf(roomName: string): SpawnMemory {
    const mem = (Memory.rooms[roomName] ??= {} as RoomMemory) as { spawn?: SpawnMemory };
    if (mem.spawn?.v !== 1) {
        mem.spawn = { v: 1 };
    }
    return mem.spawn;
}

/** The class-B perRoom entry, after economy in the normative order. */
export function runRoom(ctx: TickContext, room: RoomSnapshot): void {
    const demands = ctx.spawnDemands.filter(d => d.home === room.name);
    const slice = sliceOf(room.name);
    const { decisions, state } = resolveSpawns(demands, room, ctx.snapshot.time, slice);
    slice.blockedId = state.blockedId;
    slice.blockedSince = state.blockedSince;
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
