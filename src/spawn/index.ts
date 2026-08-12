/**
 * Spawn adapter: filters the tick's demands to this room, resolves, executes
 * spawnCreep — the one moment spawn writes creep memory. See docs/design/spawn.md.
 *
 * ## Demands are a market, not a queue
 *
 * Every producer (economy, remotes, expansion, defense, intel) pushes demands
 * into the shared tick context without knowing about each other or about what the
 * room can afford. This module is where they are reconciled: filter to the room,
 * sort by priority, spend the energy that exists. Nothing is persisted between
 * ticks except the wait record — an unmet demand is simply re-emitted next tick
 * by whoever still wants it, which means a producer can change its mind freely.
 *
 * ## Birth is the only time memory is stamped
 *
 * `home`, `owner` and `assignment` are written here, at spawnCreep, and are the
 * creep's identity for life. Everything downstream reads them; nothing else
 * writes them except the owning subsystem's own reassignment path.
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
