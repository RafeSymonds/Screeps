/**
 * Layout adapter: ensures each owned room's BasePlan slice (recomputing only on
 * version drift or anchor mismatch), and exposes the §6-blessed accessors.
 * Owner of Memory.rooms[name].layout. See docs/design/layout.md.
 *
 * ## Plan once, store packed, read often
 *
 * Planning a base is one of the most expensive computations in the bot, and its
 * answer almost never changes — so it runs essentially once per room, and only
 * re-runs when the plan version bumps or the room's spawn no longer sits on a
 * planned spawn tile (which means the stored plan describes a different base than
 * the one that exists).
 *
 * Positions are persisted packed as `y * 50 + x` integers rather than `{x, y}`
 * objects. Memory is JSON-serialized every tick and a mature plan is hundreds of
 * positions, so the packed form is several times smaller for exactly the same
 * information.
 *
 * `anchor === -1` is a negative-cache sentinel: the room genuinely cannot be
 * planned. Without it, every run would retry the same expensive failure forever.
 */
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { Pos, RoomSnapshot } from "shared/views";
import { getTerrain } from "snapshot/terrain";
import { log } from "telemetry/index";
import { BasePlan, LAYOUT_PLAN_VERSION, LayoutInput, pack, planBase, unpack } from "layout/plan";

export interface LayoutMemory {
    v: 1;
    planV: number;
    /** Packed anchor tile; -1 = room unplannable (negative-cache sentinel). */
    anchor: number;
    ctrlContainer?: number;
    places: Partial<Record<BuildableStructureConstant, number[]>>;
}

function sliceOf(roomName: string): LayoutMemory | undefined {
    return (Memory.rooms[roomName] as { layout?: LayoutMemory } | undefined)?.layout;
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

/**
 * Does the stored plan still describe THIS room's base? True if some existing
 * spawn stands on a planned spawn tile. A spawnless room passes trivially: it is
 * mid-wipe or mid-pioneer, and its plan is what we are about to rebuild from,
 * so discarding it there would be exactly backwards.
 */
function anchorMatches(mem: LayoutMemory, room: RoomSnapshot): boolean {
    const spawns = room.structures[STRUCTURE_SPAWN] ?? [];
    if (spawns.length === 0) {
        return true;
    }
    const planned = new Set(mem.places[STRUCTURE_SPAWN] ?? []);
    return spawns.some(s => planned.has(pack(s.pos.x, s.pos.y)));
}

/** The class-C perRoom entry. Early-returns on the overwhelmingly common path
 *  (a valid current plan) — the expensive work below runs once per room, ever. */
export function runRoom(_ctx: TickContext, room: RoomSnapshot): void {
    const mem = sliceOf(room.name);
    if (mem?.v === 1 && mem.planV === LAYOUT_PLAN_VERSION && (mem.anchor === -1 || anchorMatches(mem, room))) {
        return;
    }
    if (!room.controller) {
        return;
    }
    const input: LayoutInput = {
        roomName: room.name,
        terrain: getTerrain(room.name),
        controller: room.controller.pos,
        sources: room.sources.map(s => s.pos),
        ...(room.mineral ? { mineral: room.mineral.pos } : {}),
        structures: flattenStructures(room)
    };
    const plan = planBase(input);
    const roomMem = (Memory.rooms[room.name] ??= {} as RoomMemory) as { layout?: LayoutMemory };
    if (!plan) {
        log.warn(SubsystemId.Layout, () => `${room.name}: unplannable (no anchor)`);
        roomMem.layout = { v: 1, planV: LAYOUT_PLAN_VERSION, anchor: -1, places: {} };
        return;
    }
    const places: Partial<Record<BuildableStructureConstant, number[]>> = {};
    for (const [type, positions] of Object.entries(plan.places)) {
        places[type as BuildableStructureConstant] = (positions ?? []).map(p => pack(p.x, p.y));
    }
    roomMem.layout = {
        v: 1,
        planV: LAYOUT_PLAN_VERSION,
        anchor: pack(plan.anchor.x, plan.anchor.y),
        ...(plan.controllerContainer ? { ctrlContainer: pack(plan.controllerContainer.x, plan.controllerContainer.y) } : {}),
        places
    };
    const count = Object.values(places).reduce((s, a) => s + (a?.length ?? 0), 0);
    log.info(SubsystemId.Layout, () => `${room.name}: planned ${count} placements, anchor ${plan.anchor.x},${plan.anchor.y}`);
}

/** §6-blessed accessor: the unpacked plan, or undefined (absent/sentinel). */
export function getPlan(roomName: string): BasePlan | undefined {
    const mem = sliceOf(roomName);
    if (mem?.v !== 1 || mem.anchor === -1) {
        return undefined;
    }
    const places: Partial<Record<BuildableStructureConstant, Pos[]>> = {};
    for (const [type, packed] of Object.entries(mem.places)) {
        places[type as BuildableStructureConstant] = (packed ?? []).map(p => unpack(p, roomName));
    }
    return {
        anchor: unpack(mem.anchor, roomName),
        ...(mem.ctrlContainer !== undefined ? { controllerContainer: unpack(mem.ctrlContainer, roomName) } : {}),
        places
    };
}

/** §6-blessed accessor: economy's upgrade-spot sync point. */
export function getControllerContainerPos(roomName: string): Pos | undefined {
    const mem = sliceOf(roomName);
    if (mem?.v !== 1 || mem.ctrlContainer === undefined) {
        return undefined;
    }
    return unpack(mem.ctrlContainer, roomName);
}
