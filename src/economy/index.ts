/**
 * Economy adapter: ensures the econ slice (terrain-derived seats, computed once),
 * feeds the pure planner from the snapshot, pushes demands into the tick context.
 * Owner of Memory.rooms[name].econ; getUpgradeSpot is the §6-blessed accessor.
 * See docs/design/economy.md.
 *
 * This is the thin-shell half of the economy: it reads, it writes, it decides
 * nothing. Everything judgemental lives in `planner.ts` as a pure function, and
 * the split is what keeps the workforce model testable.
 *
 * The slice caches only what is expensive and immutable — terrain-derived seat
 * counts per source and the upgrade spot. Terrain never changes, so computing it
 * once and persisting it is free correctness; everything else is recomputed from
 * the snapshot each run so it cannot go stale.
 */
import { computeAllowance } from "shared/budget";
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { Pos, RoomSnapshot } from "shared/views";
import { getClaimTarget } from "expansion/index";
import { getControllerContainerPos } from "layout/index";
import { getTerrain } from "snapshot/terrain";
import { ECONOMY_CONFIG } from "economy/config";
import { planLinkTransfers } from "economy/links";
import { planRoom } from "economy/planner";
import { chooseUpgradeSpot, countAdjacentSpots } from "economy/spots";

export interface EconMemory {
    v: 1;
    upgradeSpot: { x: number; y: number };
    sourceSpots: Record<string, number>;
}

function roomMemoryOf(roomName: string): { econ?: EconMemory } {
    return (Memory.rooms[roomName] ??= {} as RoomMemory);
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

/**
 * The class-B perRoom entry: plan the room's workforce and act on the plan.
 *
 * Adoptions and reassignments are applied immediately (both are free and take
 * effect this tick); spawn demands are pushed to the shared tick context, where
 * empire's aid pass may re-home them before the spawn resolver sees them.
 */
export function runRoom(ctx: TickContext, room: RoomSnapshot): void {
    const econ = ensureEcon(room);
    if (!econ) {
        return;
    }
    // Once layout publishes a controller-container position, the upgrade spot IS
    // that tile — one compare per run, rewritten only on change (economy.md).
    const ctrlContainer = getControllerContainerPos(room.name);
    if (ctrlContainer && (econ.upgradeSpot.x !== ctrlContainer.x || econ.upgradeSpot.y !== ctrlContainer.y)) {
        econ.upgradeSpot = { x: ctrlContainer.x, y: ctrlContainer.y };
    }
    const roster = ctx.snapshot.myCreeps.filter(c => (c.memory as { home?: string }).home === room.name);
    const orphans = ctx.snapshot.myCreeps.filter(
        c => (c.memory as { home?: string }).home === undefined && !c.spawning && c.pos.roomName === room.name
    );
    const plan = planRoom({
        room,
        roster,
        orphans,
        sourceSpots: econ.sourceSpots,
        upgradeSpot: { x: econ.upgradeSpot.x, y: econ.upgradeSpot.y, roomName: room.name },
        // Principle 8: the workforce cap is this room's CPU share, not a constant.
        // It tightens automatically as the empire grows (budget.md).
        creepsAllowed: computeAllowance(Game.cpu.limit, ctx.snapshot.myRooms.length).creepsPerRoom,
        allowRebuild: getClaimTarget() !== room.name,
        config: ECONOMY_CONFIG
    });
    // Adoption: the §6 claim-by-successor path — home set once, owner recorded.
    for (const adoption of plan.adoptions) {
        const creep = Game.creeps[adoption.name];
        if (!creep) {
            continue;
        }
        creep.memory.home = room.name;
        creep.memory.owner = SubsystemId.Economy;
        creep.memory.assignment = adoption.assignment;
    }
    // Reassignment: the owner rewriting its own creeps' roles (economy.md rule 3).
    for (const reassignment of plan.reassignments) {
        const creep = Game.creeps[reassignment.name];
        if (creep) {
            creep.memory.assignment = reassignment.assignment;
        }
    }
    // Links (M5): each ready source link sends toward the controller side.
    for (const transfer of plan ? planLinkTransfers(room, getUpgradeSpot(room.name)) : []) {
        const from = Game.getObjectById(transfer.fromId) as StructureLink | null;
        const to = Game.getObjectById(transfer.toId) as StructureLink | null;
        if (from && to) {
            from.transferEnergy(to);
        }
    }
    ctx.spawnDemands.push(...plan.demands);
}
