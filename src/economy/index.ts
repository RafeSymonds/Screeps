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
import { BUDGET_CONFIG, computeAllowance, nonCreepOverhead } from "shared/budget";
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { Pos, RoomSnapshot } from "shared/views";
import { getClaimTarget } from "expansion/index";
import { getControllerContainerPos } from "layout/index";
import { getTerrain } from "snapshot/terrain";
import { takeWorkerUtilization } from "creeps/utilization";
import { log, measuredCpuPerCreep } from "telemetry/index";
import { ECONOMY_CONFIG } from "economy/config";
import { planLinkTransfers } from "economy/links";
import { LimitReason } from "economy/limits";
import { SOURCE_RATE, isBootstrapping, planRoom } from "economy/planner";
import { UtilAdjust, adjustWorkforce } from "economy/utilization";
import { chooseUpgradeSpot, countAdjacentSpots } from "economy/spots";

export interface EconMemory {
    v: 1;
    upgradeSpot: { x: number; y: number };
    sourceSpots: Record<string, number>;
    /** The utilization loop's standing correction to the modelled counts, and when
     *  it last ran. Absent means {0,0} — the loop is an adjustment to the model,
     *  never a replacement, so losing it degrades to the modelled behaviour rather
     *  than to nothing. See docs/design/utilization.md. */
    util?: { v: 1; haulers: number; workers: number; at: number };
}

/** How often the loop looks: one telemetry window, ~1/15 of a creep lifetime.
 *  Slow on purpose — a correction that outruns the spawn queue realising it is
 *  how a control loop turns into an oscillation. */
const UTIL_INTERVAL = 100;

function readAdjust(econ: EconMemory): UtilAdjust {
    return econ.util?.v === 1 ? { haulers: econ.util.haulers, workers: econ.util.workers } : { haulers: 0, workers: 0 };
}

/**
 * The utilization pass: observe, diagnose, nudge. See docs/design/utilization.md
 * for why this reads IDLENESS as well as backlog — ground energy alone cannot tell
 * a room that needs haulers from one that needs consumers, and guessing wrong made
 * it measurably worse.
 */
function runUtilization(ctx: TickContext, room: RoomSnapshot, econ: EconMemory, bootstrapping: boolean): void {
    if (ctx.snapshot.time - (econ.util?.at ?? 0) < UTIL_INTERVAL) {
        return; // let the tally ACCUMULATE — draining it every tick made the
        // "window" one tick wide, which is noise, not a duty cycle.
    }
    const seen = takeWorkerUtilization(room.name);
    // Nothing measured during a raid means anything: creeps are retreating, and the
    // room's priorities are not economic.
    if (room.hostiles.length > 0) {
        econ.util = { v: 1, ...readAdjust(econ), at: ctx.snapshot.time };
        return;
    }
    // Idle fractions are meaningless with almost no creeps, and a recovering room
    // must not be told it has too many workers while it is rebuilding.
    if (bootstrapping || seen.total === 0) {
        econ.util = { v: 1, ...readAdjust(econ), at: ctx.snapshot.time };
        return;
    }
    const production = Math.max(1, room.sources.length * SOURCE_RATE);
    const ground = room.dropped.filter(d => d.resource === RESOURCE_ENERGY).reduce((sum, d) => sum + d.amount, 0);
    const next = adjustWorkforce({
        backlogRatio: ground / production,
        workerDuty: seen.working / seen.total,
        current: readAdjust(econ)
    });
    const before = readAdjust(econ);
    econ.util = { v: 1, ...next, at: ctx.snapshot.time };
    if (next.haulers !== before.haulers || next.workers !== before.workers) {
        log.info(
            SubsystemId.Economy,
            () =>
                `${room.name}: utilization — backlog ${Math.round(ground / production)}t/prod, ` +
                `workers working ${Math.round((seen.working / seen.total) * 100)}% of ticks → ` +
                `haulers ${next.haulers >= 0 ? "+" : ""}${next.haulers}, ` +
                `workers ${next.workers >= 0 ? "+" : ""}${next.workers}`
        );
    }
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
    // Observe before planning: the loop's correction is read by planRoom below.
    runUtilization(ctx, room, econ, isBootstrapping(room, roster));
    const plan = planRoom({
        room,
        roster,
        orphans,
        sourceSpots: econ.sourceSpots,
        upgradeSpot: { x: econ.upgradeSpot.x, y: econ.upgradeSpot.y, roomName: room.name },
        // Principle 8: the workforce cap is this room's CPU share, not a constant.
        // It tightens automatically as the empire grows (budget.md).
        creepsAllowed: computeAllowance(
            Game.cpu.limit,
            ctx.snapshot.myRooms.length,
            BUDGET_CONFIG,
            measuredCpuPerCreep(nonCreepOverhead(ctx.snapshot.myRooms.length))
        ).creepsPerRoom,
        // A room under attack spends its spawn on defence, not on economy tuning.
        // The loop's correction is suspended while hostiles are present — the
        // creeps it already bought stay, but no new ones are demanded, so the
        // queue frees up for the defender. `raid-early` is the gate that keeps
        // finding this: at RCL2 anything holding the spawn queue non-empty means
        // the defender is either delayed or built small.
        // A room under attack spends its spawn on defence, not on economy tuning:
        // the creeps the loop already bought stay, but no new ones are demanded.
        adjust: room.hostiles.length > 0 ? { haulers: 0, workers: 0 } : readAdjust(econ),
        allowRebuild: getClaimTarget() !== room.name,
        config: ECONOMY_CONFIG
    });
    // Which ceiling is holding the workforce down, named rather than guessed. The
    // healthy answer is "demand" — the room has as many creeps as it can use — and
    // that one is not worth a log line; any other means a limit is biting and the
    // operator wants to know WHICH, since the fix differs completely (more spawns,
    // more income, more CPU). Throttled to the plan's own cadence.
    if (plan.ceiling && plan.ceiling.reason !== LimitReason.Demand && ctx.snapshot.time % 100 === 0) {
        const { reason, limits } = plan.ceiling;
        log.info(
            SubsystemId.Economy,
            () =>
                `${room.name}: workers capped by ${reason} — ` +
                Object.entries(limits)
                    .map(([name, n]) => `${name}=${n}`)
                    .join(" ")
        );
    }
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
