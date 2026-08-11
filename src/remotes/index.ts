/**
 * Remotes adapter: the class-C decision entry (adopt/drop/reserve, slice writes)
 * and the class-B emission entry (demands + unsafe reporting). Owner of
 * Memory.rooms[home].remotes. See docs/design/remotes.md.
 */
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { RoomSnapshot } from "shared/views";
import { AssignmentKind } from "shared/assignments";
import { getClaimTarget } from "expansion/index";
import { flagUnsafe, getIntel, isUnsafe } from "intel/index";
import { log } from "telemetry/index";
import { REMOTES_CONFIG } from "remotes/config";
import { planAdoption, planRemoteDemands, RemoteCandidate, RemotePlanInput, RemotesMemory } from "remotes/planner";

export type { RemotesMemory } from "remotes/planner";

function sliceOf(homeName: string): RemotesMemory {
    const mem = (Memory.rooms[homeName] ??= {} as RoomMemory) as { remotes?: RemotesMemory };
    if (mem.remotes?.v !== 1) {
        mem.remotes = { v: 1, rooms: {} };
    }
    return mem.remotes;
}

/** approxTravelTiles — the named cross-room distance proxy (tiles). */
function travelTiles(from: string, to: string): number {
    return Game.map.getRoomLinearDistance(from, to) * 50 + 25;
}

function buildInput(ctx: TickContext, home: RoomSnapshot): RemotePlanInput {
    const now = ctx.snapshot.time;
    const exits = Game.map.describeExits(home.name);
    const names = exits ? Object.values(exits).filter((n): n is string => typeof n === "string") : [];
    const me = Object.values(Game.spawns)[0]?.owner.username;
    // Never farm the room expansion is claiming: we would fund miners, haulers and
    // a reserver for a neighbour we are about to OWN, then drop every one of them
    // the moment the claim lands (sim-observed: adopted t279, claim started t267).
    const claimTarget = getClaimTarget();
    const candidates: RemoteCandidate[] = [];
    for (const name of names) {
        const intel = getIntel(name);
        if (intel && name !== claimTarget) {
            candidates.push({
                roomName: name,
                intel,
                travelTiles: travelTiles(home.name, name),
                unsafe: isUnsafe(name, now, REMOTES_CONFIG.unsafeMemory),
                foreignReserved: intel.reservedBy !== undefined && intel.reservedBy !== me
            });
        }
    }
    const roster = ctx.snapshot.myCreeps.filter(
        c =>
            (c.memory as { owner?: SubsystemId }).owner === SubsystemId.Remotes &&
            (c.memory as { home?: string }).home === home.name
    );
    const homeCreeps = ctx.snapshot.myCreeps.filter(
        c =>
            (c.memory as { home?: string }).home === home.name &&
            (c.memory as { owner?: SubsystemId }).owner !== SubsystemId.Remotes
    );
    const miners = homeCreeps.filter(
        c => (c.memory as { assignment?: { kind?: string } }).assignment?.kind === AssignmentKind.Mine
    ).length;
    const haulers = homeCreeps.filter(
        c => (c.memory as { assignment?: { kind?: string } }).assignment?.kind === AssignmentKind.Haul
    ).length;
    return {
        home,
        homeCap: home.energyCapacityAvailable,
        candidates,
        slice: sliceOf(home.name),
        roster,
        homeHealthy: miners >= home.sources.length && haulers >= Math.min(2, home.sources.length),
        time: now,
        config: REMOTES_CONFIG
    };
}

/** Class C (interval 50): adoption/drop/reserve decisions. */
export function runPlan(ctx: TickContext, home: RoomSnapshot): void {
    const input = buildInput(ctx, home);
    const decisions = planAdoption(input);
    const slice = input.slice;
    for (const name of decisions.drop) {
        delete slice.rooms[name];
        log.info(SubsystemId.RemotesPlan, () => `${home.name}: dropped remote ${name}`);
    }
    for (const name of decisions.adopt) {
        slice.rooms[name] = { reserved: false, adoptedAt: ctx.snapshot.time };
        log.info(SubsystemId.RemotesPlan, () => `${home.name}: adopted remote ${name}`);
    }
    for (const [name, reserved] of Object.entries(decisions.reserve)) {
        if (slice.rooms[name]) {
            slice.rooms[name].reserved = reserved;
        }
    }
}

/** Class B (every tick): unsafe reporting + demand emission. */
export function runEmit(ctx: TickContext, home: RoomSnapshot): void {
    const now = ctx.snapshot.time;
    const slice = sliceOf(home.name);
    // Report: any armed hostile visible in an adopted remote flags it via intel.
    for (const remoteName of Object.keys(slice.rooms)) {
        const view = ctx.snapshot.room(remoteName);
        if (view && view.hostiles.some(h => (h.bodyCounts[ATTACK] ?? 0) + (h.bodyCounts[RANGED_ATTACK] ?? 0) + (h.bodyCounts[HEAL] ?? 0) + (h.bodyCounts[WORK] ?? 0) + (h.bodyCounts[CLAIM] ?? 0) > 0)) {
            flagUnsafe(remoteName, now + 200);
        }
    }
    ctx.spawnDemands.push(...planRemoteDemands(buildInput(ctx, home)));
}
