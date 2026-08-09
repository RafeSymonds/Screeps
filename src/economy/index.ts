/**
 * Economy adapter: ensures the econ slice (terrain-derived seats, computed once),
 * feeds the pure planner from the snapshot, pushes demands into the tick context.
 * Owner of Memory.rooms[name].econ; getUpgradeSpot is the §6-blessed accessor.
 * See docs/design/economy.md.
 */
import { TickContext } from "shared/tick";
import { Pos, RoomSnapshot } from "shared/views";
import { getTerrain } from "snapshot/terrain";
import { ECONOMY_CONFIG } from "economy/config";
import { planRoom } from "economy/planner";
import { chooseUpgradeSpot, countAdjacentSpots } from "economy/spots";

export interface EconMemory {
    v: 1;
    upgradeSpot: { x: number; y: number };
    sourceSpots: Record<string, number>;
}

function roomMemoryOf(roomName: string): { econ?: EconMemory } {
    return (Memory.rooms[roomName] ??= {} as RoomMemory) as { econ?: EconMemory };
}

function ensureEcon(room: RoomSnapshot): EconMemory | undefined {
    const mem = roomMemoryOf(room.name);
    if (mem.econ?.v === 1) {
        return mem.econ;
    }
    if (!room.controller) {
        return undefined;
    }
    const terrain = getTerrain(room.name);
    const spawnView = room.structures[STRUCTURE_SPAWN]?.[0];
    const anchor = spawnView ? spawnView.pos : room.controller.pos;
    const upgradeSpot = chooseUpgradeSpot(terrain, room.controller.pos, anchor);
    if (!upgradeSpot) {
        return undefined;
    }
    const sourceSpots: Record<string, number> = {};
    for (const source of room.sources) {
        sourceSpots[source.id] = countAdjacentSpots(terrain, source.pos);
    }
    mem.econ = { v: 1, upgradeSpot: { x: upgradeSpot.x, y: upgradeSpot.y }, sourceSpots };
    return mem.econ;
}

/** Accessor for other subsystems (creeps' adapter) — never read the slice directly. */
export function getUpgradeSpot(roomName: string): Pos | undefined {
    const econ = (Memory.rooms[roomName] as { econ?: EconMemory } | undefined)?.econ;
    return econ ? { x: econ.upgradeSpot.x, y: econ.upgradeSpot.y, roomName } : undefined;
}

/** The class-B perRoom entry. */
export function runRoom(ctx: TickContext, room: RoomSnapshot): void {
    const econ = ensureEcon(room);
    if (!econ) {
        return;
    }
    const roster = ctx.snapshot.myCreeps.filter(c => (c.memory as { home?: string }).home === room.name);
    const demands = planRoom({
        room,
        roster,
        sourceSpots: econ.sourceSpots,
        upgradeSpot: { x: econ.upgradeSpot.x, y: econ.upgradeSpot.y, roomName: room.name },
        config: ECONOMY_CONFIG
    });
    ctx.spawnDemands.push(...demands);
}
