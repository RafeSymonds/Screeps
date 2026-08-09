/**
 * THE normative tick order (architecture §3) as data. Grows per milestone;
 * changing the order is an architecture change and updates architecture.md.
 */
import { ScheduledEntry } from "shared/scheduling";
import { CpuClass, SubsystemId } from "shared/subsystems";
import * as layout from "layout/index";
import * as construction from "construction/index";
import * as economy from "economy/index";
import * as spawn from "spawn/index";
import * as creeps from "creeps/index";
import * as movement from "movement/index";
import { TELEMETRY_CONFIG } from "telemetry/config";
import { flush } from "telemetry/index";

export const ENTRIES: ScheduledEntry[] = [
    {
        // Interval 50 phase 7 co-fires with construction's 10/7 (ticks ≡ 43 mod 50)
        // by design — layout first, so a fresh plan is consumed the same tick;
        // staggered against telemetry flush (100, phase 0). See layout.md Tick flow.
        id: SubsystemId.Layout,
        cpuClass: CpuClass.C,
        interval: 50,
        phase: 7,
        perRoom: true,
        run: (ctx, room) => layout.runRoom(ctx, room!)
    },
    {
        id: SubsystemId.Construction,
        cpuClass: CpuClass.C,
        interval: 10,
        phase: 7,
        perRoom: true,
        run: (ctx, room) => construction.runRoom(ctx, room!)
    },
    {
        id: SubsystemId.Economy,
        cpuClass: CpuClass.B,
        perRoom: true,
        run: (ctx, room) => economy.runRoom(ctx, room!)
    },
    {
        id: SubsystemId.Spawn,
        cpuClass: CpuClass.B,
        perRoom: true,
        run: (ctx, room) => spawn.runRoom(ctx, room!)
    },
    {
        id: SubsystemId.CreepExecution,
        cpuClass: CpuClass.A,
        run: ctx => creeps.runAll(ctx)
    },
    {
        id: SubsystemId.Movement,
        cpuClass: CpuClass.A,
        run: ctx => movement.resolveMoves(ctx)
    },
    {
        id: SubsystemId.TelemetryFlush,
        cpuClass: CpuClass.C,
        interval: TELEMETRY_CONFIG.FLUSH_INTERVAL,
        phase: 0,
        run: () => flush()
    }
];
