/**
 * Remotes adapter: the class-C decision entry (adopt/drop/reserve, slice writes)
 * and the class-B emission entry (demands + unsafe reporting). Owner of
 * Memory.rooms[home].remotes. See docs/design/remotes.md.
 *
 * ## Why two entries at different cadences
 *
 * Adoption is a slow, expensive judgment about which neighbors are worth mining —
 * it changes on the scale of hundreds of ticks, so it runs on a class-C interval.
 * Demand emission has to run every tick regardless: spawn demands live exactly
 * one tick, and an interval entry would offer them to the resolver on a 2% duty
 * cycle while it makes decisions every tick.
 *
 * ## Diagnosability is a feature here
 *
 * "Why are there no remotes?" has many possible answers — nothing scouted, all
 * neighbors owned, profit below threshold, home not healthy yet — and from
 * outside they all look identical to a broken subsystem. `rejectionReason` is a
 * single source of truth for the gate, and this adapter logs it precisely when a
 * home has no remotes, i.e. exactly when someone is asking.
 */
import { BUDGET_CONFIG, computeAllowance, nonCreepOverhead } from "shared/budget";
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { RoomSnapshot } from "shared/views";
import { AssignmentKind } from "shared/assignments";
import { getClaimTarget } from "expansion/index";
import { flagUnsafe, getIntel, isUnsafe, reachableRooms } from "intel/index";
import { log, measuredCpuPerCreep } from "telemetry/index";
import { REMOTES_CONFIG } from "remotes/config";
import {
    planAdoption,
    planRemoteDemands,
    RemoteCandidate,
    RemotePlanInput,
    RemotesMemory,
    rejectionReason
} from "remotes/planner";

export type { RemotesMemory } from "remotes/planner";

function sliceOf(homeName: string): RemotesMemory {
    const mem = (Memory.rooms[homeName] ??= {} as RoomMemory) as { remotes?: RemotesMemory };
    if (mem.remotes?.v !== 1) {
        mem.remotes = { v: 1, rooms: {} };
    }
    return mem.remotes;
}

/**
 * approxTravelTiles — the named cross-room distance proxy (tiles), from the
 * number of borders a creep actually crosses.
 *
 * This used to read `Game.map.getRoomLinearDistance × 50 + 25`, which is chebyshev
 * and therefore calls a diagonal neighbour "1 room away" — but there is no
 * diagonal room exit, so reaching it means two crossings and about twice the walk.
 * Every hauler count for such a room was sized against half the real trip.
 */
function travelTiles(depth: number): number {
    return depth * 50 + 25;
}

function buildInput(ctx: TickContext, home: RoomSnapshot): RemotePlanInput {
    const now = ctx.snapshot.time;
    // Everything within maxDepth border crossings, source-keeper rooms excluded by
    // the graph itself. Depth 1 (the four rooms next door) was never a principled
    // limit, just the easy query — and it leaves a two-source room one extra
    // border away unmined while a barren neighbour is all we consider.
    const reachable = reachableRooms(home.name, REMOTES_CONFIG.maxDepth);
    const me = Object.values(Game.spawns)[0]?.owner.username;
    // Never farm the room expansion is claiming: we would fund miners, haulers and
    // a reserver for a neighbour we are about to OWN, then drop every one of them
    // the moment the claim lands (sim-observed: adopted t279, claim started t267).
    const claimTarget = getClaimTarget();
    const candidates: RemoteCandidate[] = [];
    for (const [name, depth] of reachable) {
        if (depth === 0) {
            continue; // home itself
        }
        const intel = getIntel(name);
        if (intel && name !== claimTarget) {
            candidates.push({
                roomName: name,
                intel,
                depth,
                travelTiles: travelTiles(depth),
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
    const allowance = computeAllowance(
        Game.cpu.limit,
        ctx.snapshot.myRooms.length,
        BUDGET_CONFIG,
        measuredCpuPerCreep(nonCreepOverhead(ctx.snapshot.myRooms.length))
    );
    return {
        home,
        homeCap: home.energyCapacityAvailable,
        candidates,
        slice: sliceOf(home.name),
        roster,
        homeHealthy: miners >= home.sources.length && haulers >= Math.min(2, home.sources.length),
        // Principle 8: how many remotes this home's CPU share affords (budget.md).
        remotesAllowed: allowance.remotesPerHome,
        remoteCreepsAllowed: allowance.remoteCreepsAllowed,
        time: now,
        config: REMOTES_CONFIG,
        health: { miners, minersNeeded: home.sources.length, haulers, haulersNeeded: Math.min(2, home.sources.length) }
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

    // "Why are there no remotes?" should be answerable from the console, not by
    // reading source. Logged only while this home has none — i.e. exactly when
    // someone is asking — and only on this class-C pass, so it stays quiet.
    // Adopted but silent: the home-health gate blocks EVERY remote demand, and a
    // room short one miner looks identical to "remotes are broken" from outside.
    if (Object.keys(slice.rooms).length > 0 && !input.homeHealthy) {
        const h = input.health;
        log.info(
            SubsystemId.RemotesPlan,
            () =>
                `${home.name}: remotes idle — home not healthy (miners ${h.miners}/${h.minersNeeded}, ` +
                `haulers ${h.haulers}/${h.haulersNeeded})`
        );
    }
    if (Object.keys(slice.rooms).length === 0) {
        // Reaching two rooms out means a dozen candidates rather than four, so the
        // per-candidate list is capped — nearest first, since those are the ones
        // anybody asking actually cares about.
        const listed = 8;
        const sorted = [...input.candidates].sort((a, b) => a.depth - b.depth || (a.roomName < b.roomName ? -1 : 1));
        const why =
            sorted.length === 0
                ? "nothing scouted yet"
                : sorted
                      .slice(0, listed)
                      .map(
                          c =>
                              `${c.roomName}(d${c.depth}): ` +
                              `${rejectionReason(c, input.homeCap, REMOTES_CONFIG) ?? "eligible"}`
                      )
                      .join("; ") + (sorted.length > listed ? `; +${sorted.length - listed} more` : "");
        // The candidate list only names rooms we have INTEL for, so a room the map
        // never offered and a room no scout has reached look identical in it — and
        // they need opposite fixes. Printing the graph separates them. Free to
        // compute (heap-cached) and only emitted while a home has no remotes.
        const reachable = [...reachableRooms(home.name, REMOTES_CONFIG.maxDepth)]
            .filter(([, depth]) => depth > 0)
            .map(([name, depth]) => `${name}(d${depth})`);
        log.info(
            SubsystemId.RemotesPlan,
            () =>
                `${home.name}: no remote adopted — ${why} | reach(${REMOTES_CONFIG.maxDepth}): ` +
                `${reachable.length > 0 ? reachable.join(",") : "EMPTY — map gave no exits"}`
        );
    }
}

/**
 * Class B (every tick): unsafe reporting + demand emission.
 *
 * Our own creeps in a remote are the only eyes we have there, so this pass
 * doubles as a tripwire — an armed hostile seen in an adopted remote flags the
 * room unsafe through intel, which both pulls our creeps out (via the retreat
 * rule in creep dispatch) and stops new ones being sent.
 */
export function runEmit(ctx: TickContext, home: RoomSnapshot): void {
    const now = ctx.snapshot.time;
    const slice = sliceOf(home.name);
    // Report: any armed hostile visible in an adopted remote flags it via intel.
    for (const remoteName of Object.keys(slice.rooms)) {
        const view = ctx.snapshot.room(remoteName);
        if (
            view &&
            view.hostiles.some(
                h =>
                    (h.bodyCounts[ATTACK] ?? 0) +
                        (h.bodyCounts[RANGED_ATTACK] ?? 0) +
                        (h.bodyCounts[HEAL] ?? 0) +
                        (h.bodyCounts[WORK] ?? 0) +
                        (h.bodyCounts[CLAIM] ?? 0) >
                    0
            )
        ) {
            flagUnsafe(remoteName, now + 200);
        }
    }
    ctx.spawnDemands.push(...planRemoteDemands(buildInput(ctx, home)));
}
