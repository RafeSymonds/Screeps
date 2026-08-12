/**
 * Construction adapter: the class-C perRoom entry. Feeds the pure sequencer from
 * the snapshot + layout accessor and executes its intents, tolerating engine
 * rejections (blocked tile, global site cap) — next run recomputes everything.
 * Owner of Memory.rooms[name].build (reserved). See docs/design/construction.md.
 *
 * Engine rejections are logged at debug and otherwise ignored, which is safe
 * precisely because the sequencer keeps no queue: a site that failed to place is
 * simply still missing next run, and gets tried again. There is no bookkeeping to
 * corrupt and no retry logic to write.
 */
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { Pos, RoomSnapshot } from "shared/views";
import { getPlan } from "layout/index";
import { log } from "telemetry/index";
import { CONSTRUCTION_CONFIG } from "construction/config";
import { sequenceBuilds } from "construction/sequencer";

export interface BuildMemory {
    v: 1;
}

function flattenStructures(room: RoomSnapshot): { type: StructureConstant; pos: Pos }[] {
    const out: { type: StructureConstant; pos: Pos }[] = [];
    for (const [type, views] of Object.entries(room.structures)) {
        for (const v of views ?? []) {
            out.push({ type: type as StructureConstant, pos: v.pos });
        }
    }
    return out;
}

/** The class-C perRoom entry — runs after layout (same-tick plan freshness). */
export function runRoom(_ctx: TickContext, room: RoomSnapshot): void {
    const mem = (Memory.rooms[room.name] ??= {} as RoomMemory) as { build?: BuildMemory };
    mem.build ??= { v: 1 };
    const plan = getPlan(room.name);
    if (!plan) {
        return;
    }
    const intents = sequenceBuilds({
        rcl: room.controller?.level ?? 0,
        plan,
        structures: flattenStructures(room),
        mySites: room.myConstructionSites,
        config: CONSTRUCTION_CONFIG
    });
    for (const id of intents.removeSiteIds) {
        Game.getObjectById(id)?.remove();
    }
    const liveRoom = Game.rooms[room.name];
    if (!liveRoom) {
        return;
    }
    for (const c of intents.create) {
        const rc = liveRoom.createConstructionSite(c.pos.x, c.pos.y, c.type as BuildableStructureConstant);
        if (rc !== OK) {
            log.debug(SubsystemId.Construction, () => `${room.name}: place ${c.type}@${c.pos.x},${c.pos.y} → ${rc}`);
        }
    }
}
