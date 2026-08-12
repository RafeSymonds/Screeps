/**
 * The tick, top to bottom — the only place that knows the outermost order.
 * See docs/design/shell.md.
 *
 * Everything before the scheduler exists to make the subsystems naive: by the
 * time `runTick` is reached, Memory is valid, respawn has been detected, dead
 * creeps are pruned, and the world is a plain-data snapshot. Nothing downstream
 * has to null-check its own Memory root or wonder whether it is a new world.
 *
 * ## Failure policy
 *
 * Independent steps (continuity, creep GC) are trapped and the tick continues —
 * losing one of them costs some bookkeeping, not the tick. The two *foundational*
 * steps are different: if Memory bootstrap or the snapshot fails, running
 * subsystems would mean acting on state we know is broken, so the tick skips
 * straight to `endTick`. `endTick` always runs, because the evidence of the
 * failure is the one thing that must survive it.
 */
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { runTick } from "scheduler/index";
import { gameCpuMeter } from "scheduler/meter";
import { buildSnapshot } from "snapshot/index";
import * as telemetry from "telemetry/index";
import { checkWorldContinuity } from "shell/continuity";
import { cleanDeadCreepMemory } from "shell/creepGc";
import { ensureMemory } from "shell/memory";
import { ENTRIES } from "shell/entries";

/** Module scope, so a fresh heap means a fresh `false` — that IS the global-reset
 *  detector. Screeps gives no other signal that the VM restarted. */
let booted = false;

/** Owned rooms by plain iteration, before any snapshot exists. One of the two
 *  documented exceptions to snapshot's monopoly on world reads (shell.md). */
function ownedRoomNames(): string[] {
    const names: string[] = [];
    for (const room of Object.values(Game.rooms)) {
        if (room.controller?.my === true) {
            names.push(room.name);
        }
    }
    return names;
}

export function tick(): void {
    telemetry.beginTick(Game.time);
    if (!booted) {
        booted = true;
        telemetry.countReset(Game.time);
    }

    const meter = gameCpuMeter;
    const shellStart = meter.used();
    let foundationOk = true;
    try {
        ensureMemory();
    } catch (err) {
        telemetry.countError(SubsystemId.Shell, err);
        foundationOk = false;
    }
    if (foundationOk) {
        try {
            checkWorldContinuity(ownedRoomNames());
        } catch (err) {
            telemetry.countError(SubsystemId.Shell, err);
        }
        // ORDERING INVARIANT: this must stay ahead of the scheduler. `spawnCreep`
        // writes Memory.creeps[name] at tick T but the creep only appears in
        // Game.creeps at T+1, so a GC running after spawn intents would delete
        // newborn memories.
        try {
            cleanDeadCreepMemory();
        } catch (err) {
            telemetry.countError(SubsystemId.Shell, err);
        }
    }
    telemetry.reporter.entryRan(SubsystemId.Shell, null, meter.used() - shellStart);

    if (foundationOk) {
        const snapshotStart = meter.used();
        let ctx: TickContext | undefined;
        try {
            ctx = { snapshot: buildSnapshot(), spawnDemands: [] };
            telemetry.reporter.entryRan(SubsystemId.Snapshot, null, meter.used() - snapshotStart);
        } catch (err) {
            telemetry.reporter.entryFailed(SubsystemId.Snapshot, null, err);
        }
        if (ctx) {
            runTick(ENTRIES, ctx, meter, telemetry.reporter);
        }
    }

    telemetry.endTick(Game.cpu.getUsed(), Game.cpu.limit, Game.cpu.bucket);
}
