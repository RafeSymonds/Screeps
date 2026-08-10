/**
 * THE normative tick order (architecture §3) as data. Grows per milestone;
 * changing the order is an architecture change and updates architecture.md.
 */
import { ScheduledEntry } from "shared/scheduling";
import { CpuClass, SubsystemId } from "shared/subsystems";
import * as defense from "defense/index";
import * as empire from "empire/index";
import * as expansion from "expansion/index";
import * as intel from "intel/index";
import * as remotes from "remotes/index";
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
        // First: assess + towers fire even when everything else sheds.
        id: SubsystemId.DefenseTowers,
        cpuClass: CpuClass.A,
        perRoom: true,
        run: (ctx, room) => defense.runTowers(ctx, room!)
    },
    {
        // Demands must precede spawn; sheds under pressure while towers keep firing.
        id: SubsystemId.DefenseResponse,
        cpuClass: CpuClass.B,
        perRoom: true,
        run: (ctx, room) => defense.runResponse(ctx, room!)
    },
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
        // Registry + expansion trigger: must precede Expansion, which reads it.
        id: SubsystemId.Empire,
        cpuClass: CpuClass.C,
        interval: 20,
        phase: 17,
        run: ctx => empire.runRegistry(ctx)
    },
    {
        // Refresh + scout rotation; demands are cheap [MOVE] bodies, and the
        // 1-in-25 demand duty cycle is fine for scouting latency (intel.md).
        id: SubsystemId.Intel,
        cpuClass: CpuClass.C,
        interval: 25,
        phase: 13,
        run: ctx => intel.run(ctx)
    },
    {
        // Adopt/drop/reserve decisions — slow-moving, intel-driven.
        id: SubsystemId.RemotesPlan,
        cpuClass: CpuClass.C,
        interval: 50,
        phase: 21,
        perRoom: true,
        run: (ctx, room) => remotes.runPlan(ctx, room!)
    },
    {
        // Demand emission + unsafe reporting, every tick (demands live one tick).
        id: SubsystemId.Remotes,
        cpuClass: CpuClass.B,
        perRoom: true,
        run: (ctx, room) => remotes.runEmit(ctx, room!)
    },
    {
        // Claim decisions — slow-moving and observation-driven.
        id: SubsystemId.Expansion,
        cpuClass: CpuClass.C,
        interval: 50,
        phase: 33,
        run: ctx => expansion.runDecision(ctx, empire.expansionWanted(ctx))
    },
    {
        // Claimer/pioneer demands. Class B because demands live exactly one tick:
        // a class-C producer would have a 2% duty cycle against a resolver that
        // decides once per free spawn per tick.
        id: SubsystemId.ExpansionSpawn,
        cpuClass: CpuClass.B,
        run: ctx => expansion.runEmit(ctx)
    },
    {
        id: SubsystemId.Economy,
        cpuClass: CpuClass.B,
        perRoom: true,
        run: (ctx, room) => economy.runRoom(ctx, room!)
    },
    {
        // Aid must see THIS tick's demands (economy's included) and precede spawn.
        id: SubsystemId.EmpireAid,
        cpuClass: CpuClass.B,
        run: ctx => empire.runAid(ctx)
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
