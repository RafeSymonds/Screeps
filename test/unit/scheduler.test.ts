import { expect } from "../helpers/chai";
import { CpuMeter, ScheduledEntry, SchedulerReporter, SkipReason } from "shared/scheduling";
import { CpuClass, SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { RoomSnapshot } from "shared/views";
import { SCHEDULER_CONFIG } from "scheduler/config";
import { isDue, shouldRun } from "scheduler/gates";
import { runTick } from "scheduler/index";

interface MeterState {
    used: number;
    limit: number;
    bucket: number;
}

function fakeMeter(state: MeterState): CpuMeter {
    return {
        used: () => state.used,
        limit: () => state.limit,
        bucket: () => state.bucket
    };
}

interface Report {
    kind: "ran" | "skipped" | "failed";
    id: SubsystemId;
    room: string | null;
    cpu?: number;
    reason?: SkipReason;
}

function recorder(): { reports: Report[]; reporter: SchedulerReporter } {
    const reports: Report[] = [];
    return {
        reports,
        reporter: {
            entryRan: (id, room, cpu) => reports.push({ kind: "ran", id, room, cpu }),
            entrySkipped: (id, room, reason) => reports.push({ kind: "skipped", id, room, reason }),
            entryFailed: (id, room) => reports.push({ kind: "failed", id, room })
        }
    };
}

function ctxWith(time: number, roomNames: string[] = []): TickContext {
    const myRooms = roomNames.map(name => ({ name } as RoomSnapshot));
    return { snapshot: { time, myRooms, myCreeps: [], room: () => undefined }, spawnDemands: [] } as TickContext;
}

function entry(overrides: Partial<ScheduledEntry>): ScheduledEntry {
    return {
        id: SubsystemId.TelemetryFlush,
        cpuClass: CpuClass.A,
        run: () => undefined,
        ...overrides
    };
}

describe("scheduler gates", () => {
    const config = SCHEDULER_CONFIG;

    it("always runs class A regardless of bucket and cpu", () => {
        const meter = fakeMeter({ used: 100, limit: 20, bucket: 0 });
        expect(shouldRun(entry({ cpuClass: CpuClass.A }), meter, config)).to.deep.equal({ run: true });
    });

    it("gates class B on bucket floor and cpu headroom", () => {
        const state = { used: 0, limit: 20, bucket: 10000 };
        const b = entry({ cpuClass: CpuClass.B });
        expect(shouldRun(b, fakeMeter(state), config)).to.deep.equal({ run: true });
        expect(shouldRun(b, fakeMeter({ ...state, bucket: config.bucketFloorB - 1 }), config)).to.deep.equal({
            run: false,
            reason: SkipReason.Bucket
        });
        expect(shouldRun(b, fakeMeter({ ...state, used: config.headroomB * 20 + 0.1 }), config)).to.deep.equal({
            run: false,
            reason: SkipReason.CpuHeadroom
        });
    });

    it("gates class C harder than class B", () => {
        const c = entry({ cpuClass: CpuClass.C });
        expect(shouldRun(c, fakeMeter({ used: 0, limit: 20, bucket: config.bucketFloorC - 1 }), config)).to.deep.equal({
            run: false,
            reason: SkipReason.Bucket
        });
        expect(shouldRun(c, fakeMeter({ used: config.headroomC * 20 + 0.1, limit: 20, bucket: 10000 }), config)).to.deep.equal(
            { run: false, reason: SkipReason.CpuHeadroom }
        );
        expect(shouldRun(c, fakeMeter({ used: 0, limit: 20, bucket: 10000 }), config)).to.deep.equal({ run: true });
    });

    it("computes cadence from time + phase", () => {
        const e = entry({ cpuClass: CpuClass.C, interval: 10, phase: 0 });
        expect(isDue(e, 20)).to.equal(true);
        expect(isDue(e, 21)).to.equal(false);
        const staggered = entry({ cpuClass: CpuClass.C, interval: 10, phase: 5 });
        expect(isDue(staggered, 20)).to.equal(false);
        expect(isDue(staggered, 25)).to.equal(true);
    });
});

describe("scheduler runTick", () => {
    it("invokes entries in array order and meters cpu deltas", () => {
        const state = { used: 0, limit: 20, bucket: 10000 };
        const order: string[] = [];
        const { reports, reporter } = recorder();
        const entries = [
            entry({
                id: SubsystemId.Shell,
                run: () => {
                    order.push("first");
                    state.used += 2.5;
                }
            }),
            entry({
                id: SubsystemId.Snapshot,
                run: () => {
                    order.push("second");
                    state.used += 1;
                }
            })
        ];
        runTick(entries, ctxWith(1), fakeMeter(state), reporter);
        expect(order).to.deep.equal(["first", "second"]);
        expect(reports[0]).to.deep.include({ kind: "ran", id: SubsystemId.Shell, cpu: 2.5 });
        expect(reports[1]).to.deep.include({ kind: "ran", id: SubsystemId.Snapshot, cpu: 1 });
    });

    it("re-checks gates between invocations so a blown budget stops later class B/C work", () => {
        const state = { used: 0, limit: 20, bucket: 10000 };
        const { reports, reporter } = recorder();
        const entries = [
            entry({
                id: SubsystemId.Shell,
                cpuClass: CpuClass.A,
                run: () => {
                    state.used = 19;
                }
            }),
            entry({ id: SubsystemId.TelemetryFlush, cpuClass: CpuClass.B })
        ];
        runTick(entries, ctxWith(1), fakeMeter(state), reporter);
        expect(reports[1]).to.deep.include({
            kind: "skipped",
            id: SubsystemId.TelemetryFlush,
            reason: SkipReason.CpuHeadroom
        });
    });

    it("contains a throwing entry and continues", () => {
        const state = { used: 0, limit: 20, bucket: 10000 };
        const { reports, reporter } = recorder();
        const entries = [
            entry({
                id: SubsystemId.Shell,
                run: () => {
                    throw new Error("boom");
                }
            }),
            entry({ id: SubsystemId.Snapshot })
        ];
        runTick(entries, ctxWith(1), fakeMeter(state), reporter);
        expect(reports[0]).to.deep.include({ kind: "failed", id: SubsystemId.Shell });
        expect(reports[1]).to.deep.include({ kind: "ran", id: SubsystemId.Snapshot });
    });

    it("iterates perRoom entries per owned room with per-room containment", () => {
        const state = { used: 0, limit: 20, bucket: 10000 };
        const { reports, reporter } = recorder();
        const visited: string[] = [];
        const entries = [
            entry({
                perRoom: true,
                run: (_ctx, room) => {
                    visited.push(room!.name);
                    if (room!.name === "W1N1") {
                        throw new Error("room went sideways");
                    }
                }
            })
        ];
        runTick(entries, ctxWith(1, ["W1N1", "W2N2"]), fakeMeter(state), reporter);
        expect(visited).to.deep.equal(["W1N1", "W2N2"]);
        expect(reports[0]).to.deep.include({ kind: "failed", room: "W1N1" });
        expect(reports[1]).to.deep.include({ kind: "ran", room: "W2N2" });
    });

    it("treats not-due interval entries as cadence, not skips — nothing reported", () => {
        const state = { used: 0, limit: 20, bucket: 10000 };
        const { reports, reporter } = recorder();
        const ran: number[] = [];
        const entries = [
            entry({
                cpuClass: CpuClass.C,
                interval: 10,
                phase: 0,
                run: () => {
                    ran.push(1);
                }
            })
        ];
        runTick(entries, ctxWith(11), fakeMeter(state), reporter);
        expect(ran).to.have.length(0);
        expect(reports).to.have.length(0);
        runTick(entries, ctxWith(20), fakeMeter(state), reporter);
        expect(ran).to.have.length(1);
    });
});
