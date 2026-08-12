/**
 * Defense adapter: the two scheduled entries (towers class A, response class B)
 * plus the fortificationTargets accessor. Owner of Memory.rooms[name].defense.
 * See docs/design/defense.md.
 *
 * ## Why defense is split across two entries
 *
 * Towers are class A and run FIRST in the whole tick, because tower fire is both
 * the cheapest and the most decisive defensive act available — 600 damage at
 * range 5 for one intent, no creep required. It must never be shed under CPU
 * pressure, and it must run before anything else has a chance to overrun the
 * budget.
 *
 * Response (spawning defenders, arbitrating safe mode) is class B: slower, more
 * expensive, and tolerable to skip for a tick. Splitting them means a CPU crisis
 * degrades the *reaction* while the guns keep firing.
 *
 * The two share `lastHostile`, and the class-A entry is what stamps it — the
 * class-B entry can be skipped, and fortification scaling must not go blind about
 * an ongoing raid just because the response pass was shed.
 *
 * ## The escalation ladder
 *
 * Towers → defender creeps → safe mode, in that order of cost. Safe mode is
 * last because it is per-user, limited, and on a cooldown: it is the thing you
 * spend when losing the room is the alternative.
 */
import { DIPLOMACY_CONFIG } from "shared/diplomacy";
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { RoomSnapshot } from "shared/views";
import { resolve } from "snapshot/handles";
import { confirmSafeMode, requestSafeMode } from "empire/index";
import { alert, AlertKind, log } from "telemetry/index";
import { DEFENSE_CONFIG } from "defense/config";
import { computeFortifyTargets, FortifyTarget } from "defense/fortify";
import { planDefense } from "defense/response";
import { planTowerFire } from "defense/towers";
import { assessThreat, ThreatLevel } from "defense/threat";

export interface DefenseMemory {
    v: 1;
    level: ThreatLevel;
    lastHostile?: number;
}

function sliceOf(roomName: string): DefenseMemory {
    const mem = (Memory.rooms[roomName] ??= {} as RoomMemory) as { defense?: DefenseMemory };
    if (mem.defense?.v !== 1) {
        mem.defense = { v: 1, level: ThreatLevel.None };
    }
    return mem.defense;
}

/** Class A, perRoom, every tick, FIRST in entry order: assess, stamp, fire.
 *  The class-A entry stamps lastHostile (the response entry sheds under CPU
 *  pressure, and fortification scaling must not go blind during a raid). */
export function runTowers(_ctx: TickContext, room: RoomSnapshot): void {
    if (room.hostiles.length === 0 && sliceOf(room.name).level === ThreatLevel.None) {
        // Almost every tick of the bot's life lands here. This entry runs first,
        // every tick, in every room, so its quiet-room cost is a permanent tax —
        // keep it to one array-length check plus a slice read.
        return;
    }
    const assessment = assessThreat(room, DIPLOMACY_CONFIG, DEFENSE_CONFIG.siegeFactor);
    const slice = sliceOf(room.name);
    slice.level = assessment.level;
    if (assessment.hostiles.length > 0) {
        slice.lastHostile = Game.time;
    }
    for (const shot of planTowerFire(room, assessment)) {
        const tower = resolve(shot.towerId);
        const target = resolve(shot.targetId);
        if (tower && target) {
            tower.attack(target);
        }
    }
}

/** Class B, perRoom, after towers: defender demands + the M4 safe-mode stub
 *  (M6 moves arbitration to empire; the request/grant split already exists). */
export function runResponse(ctx: TickContext, room: RoomSnapshot): void {
    if (room.hostiles.length === 0) {
        return;
    }
    const assessment = assessThreat(room, DIPLOMACY_CONFIG, DEFENSE_CONFIG.siegeFactor);
    const roster = ctx.snapshot.myCreeps.filter(c => (c.memory as { home?: string }).home === room.name);
    const plan = planDefense(room, assessment, roster, DEFENSE_CONFIG);
    ctx.spawnDemands.push(...plan.demands);
    // Rung 3: defense REQUESTS, empire GRANTS (shard-scarce, and same-tick
    // serialization matters — the engine keeps only the last intent of a tick).
    if (plan.requestSafeMode && room.controller && requestSafeMode(room.name, ctx)) {
        const controller = resolve(room.controller.id);
        if (controller) {
            const rc = controller.activateSafeMode();
            if (rc === OK) {
                confirmSafeMode(ctx.snapshot.time); // stamp on OK, never on grant
                alert(AlertKind.SafeMode, `${room.name}: SAFE MODE activated`);
            } else {
                log.warn(SubsystemId.DefenseResponse, () => `${room.name}: safe mode refused (${rc})`);
            }
        }
    }
}

/** §6-blessed accessor — reads the slice for threat recency, calls the pure core.
 *  Consumers memoize per room per tick (creeps' adapter does). */
export function fortificationTargets(roomName: string, room: RoomSnapshot): FortifyTarget[] {
    const slice = sliceOf(roomName);
    const recentThreat =
        slice.lastHostile !== undefined && Game.time - slice.lastHostile <= DEFENSE_CONFIG.threatMemory;
    return computeFortifyTargets(room, room.controller?.level ?? 0, recentThreat, DEFENSE_CONFIG);
}
