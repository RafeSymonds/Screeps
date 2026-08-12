/**
 * Empire adapter: the registry/trigger entry (class C), the aid pass (class B,
 * between the producers and spawn), and safe-mode arbitration. Owner of
 * Memory.empire. See docs/design/empire.md.
 *
 * ## The cross-room layer
 *
 * Every other subsystem reasons about one room. Empire owns the three questions
 * that only make sense across rooms:
 *
 *  1. **How is each room doing?** A lifecycle label per room (Stable, Crippled,
 *     …) that other subsystems gate on, so "is this room healthy" has one
 *     definition rather than five.
 *  2. **Should a healthy room pay for a sick one?** The aid pass re-homes spawn
 *     demands: a room that lost its spawn cannot build its own rebuild crew, so
 *     a neighbor builds it instead. It runs after every producer and before
 *     spawn, which is the only window where the full tick's demands exist and
 *     none has been acted on yet.
 *  3. **Who gets safe mode?** It is per-user and precious, so arbitration cannot
 *     live inside any one room's defense.
 *
 * ## Safe mode has a same-tick hazard
 *
 * The engine keeps only the LAST `activateSafeMode` intent of a tick. Two rooms
 * requesting simultaneously do not queue — the second silently overwrites the
 * first, and the room you meant to save gets nothing. `grantedOnTick` is a
 * heap-only, deliberately non-persisted guard against exactly that: it only needs
 * to be correct within a tick, and persisting it would be meaningless.
 */
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { lastWindowAvgCpu, log } from "telemetry/index";
import { getClaimTarget } from "expansion/index";
import { brokerAid, planAidRoutes } from "empire/aid";
import { EMPIRE_CONFIG } from "empire/config";
import { classify, RoomLifecycle } from "empire/registry";

export interface EmpireMemory {
    v: 1;
    rooms: Record<string, { state: RoomLifecycle; since: number }>;
    lastSafeModeGrant?: number;
}

function slice(): EmpireMemory {
    const mem = Memory as { empire?: EmpireMemory };
    if (mem.empire?.v !== 1 || typeof mem.empire.rooms !== "object") {
        mem.empire = { v: 1, rooms: {} };
    }
    return mem.empire;
}

/** Heap-only in-tick guard: the engine keeps ONLY THE LAST activateSafeMode
 *  intent of a tick, so two rooms firing together silently cancel each other —
 *  losing the room you meant to save. Serialization must be same-tick. */
let grantedOnTick = -1;

export function getLifecycle(roomName: string): RoomLifecycle | undefined {
    return slice().rooms[roomName]?.state;
}

/** Defense requests; empire grants. Stamped on engine OK via confirmSafeMode. */
export function requestSafeMode(roomName: string, ctx: TickContext): boolean {
    if (grantedOnTick === ctx.snapshot.time) {
        return false; // another room already fired this tick
    }
    const anyActive = ctx.snapshot.myRooms.some(r => (r.controller?.safeMode ?? 0) > 0);
    if (anyActive) {
        return false; // the engine's per-user ERR_BUSY, checked before we burn an intent
    }
    const last = slice().lastSafeModeGrant;
    if (last !== undefined && ctx.snapshot.time - last < EMPIRE_CONFIG.grantCooldown) {
        return false;
    }
    grantedOnTick = ctx.snapshot.time;
    log.warn(SubsystemId.Empire, () => `${roomName}: safe-mode grant issued`);
    return true;
}

/** Stamp the policy cooldown only when the engine actually accepted (a refusal
 *  must not burn the cooldown on the room that could have used it). */
export function confirmSafeMode(time: number): void {
    slice().lastSafeModeGrant = time;
}

/**
 * Expansion reads this: empire decides WHEN, expansion decides WHERE.
 *
 * Three gates, all of which must pass: GCL allows another room at all, CPU has
 * headroom to run one (a second room we cannot afford to think about is worse
 * than no second room), and every existing room is already Stable. That last one
 * is the important discipline — expanding out of a struggling empire produces two
 * struggling rooms.
 */
export function expansionWanted(ctx: TickContext): boolean {
    const mem = slice();
    const owned = ctx.snapshot.myRooms.length;
    if (Game.gcl.level <= owned) {
        return false; // exactly the engine's claim gate (verified equivalent)
    }
    const avgCpu = lastWindowAvgCpu();
    if (avgCpu === undefined || avgCpu > Game.cpu.limit * EMPIRE_CONFIG.cpuHeadroom) {
        return false; // no full window yet → conservative cold start
    }
    return ctx.snapshot.myRooms.every(r => mem.rooms[r.name]?.state === RoomLifecycle.Stable);
}

/** Class C (interval 20): classify every owned room, prune the departed. */
export function runRegistry(ctx: TickContext): void {
    const mem = slice();
    const claimTarget = getClaimTarget();
    const seen = new Set<string>();
    for (const room of ctx.snapshot.myRooms) {
        seen.add(room.name);
        const homed = ctx.snapshot.myCreeps.filter(c => (c.memory as { home?: string }).home === room.name).length;
        const state = classify(room, homed, claimTarget);
        const prev = mem.rooms[room.name];
        if (!prev || prev.state !== state) {
            mem.rooms[room.name] = { state, since: ctx.snapshot.time };
        }
    }
    for (const name of Object.keys(mem.rooms)) {
        if (!seen.has(name)) {
            // No alert here: the shell's continuity check already fired RoomLost a
            // tick earlier, and telemetry dedupes by kind — a second one is noise.
            delete mem.rooms[name];
        }
    }
}

/**
 * Class B (every tick), ordered after the producers and before spawn — the only
 * point in the tick where every demand exists and none has been resolved.
 *
 * Rewrites `home` on demands from rooms that cannot fund them, pointing them at a
 * healthy donor's spawn. The demand list is replaced in place because it is the
 * shared per-tick channel; spawn resolution sees only the brokered result.
 */
export function runAid(ctx: TickContext): void {
    const mem = slice();
    if (ctx.spawnDemands.length === 0) {
        return;
    }
    const lifecycles: Record<string, RoomLifecycle> = {};
    for (const [name, entry] of Object.entries(mem.rooms)) {
        lifecycles[name] = entry.state;
    }
    const routes = planAidRoutes(lifecycles, (a, b) => Game.map.getRoomLinearDistance(a, b), EMPIRE_CONFIG);
    if (Object.keys(routes).length === 0) {
        return;
    }
    const rehomed = brokerAid(ctx.spawnDemands, routes, EMPIRE_CONFIG);
    ctx.spawnDemands.length = 0;
    ctx.spawnDemands.push(...rehomed);
}
