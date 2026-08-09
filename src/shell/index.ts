/**
 * The tick, top to bottom — the only place that knows the outermost order.
 * See docs/design/shell.md.
 */
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { runTick } from "scheduler/index";
import { gameCpuMeter } from "scheduler/meter";
import { buildSnapshot } from "snapshot/index";
import * as telemetry from "telemetry/index";
import { checkWorldContinuity } from "shell/continuity";
import { cleanDeadCreepMemory } from "shell/creepGc";
import { ensureAndMigrate } from "shell/memory";
import { ENTRIES } from "shell/entries";

let booted = false;

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
        ensureAndMigrate();
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
