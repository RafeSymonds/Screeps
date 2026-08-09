import { expect } from "../helpers/chai";
import { SkipReason } from "shared/scheduling";
import { SubsystemId } from "shared/subsystems";
import { STATS_VERSION, TELEMETRY_CONFIG as CFG } from "telemetry/config";
import * as telemetry from "telemetry/index";
import { AlertKind, LogLevel } from "telemetry/index";

interface Notification {
    message: string;
    groupMinutes: number;
}

let sent: Notification[];

function stats(): NonNullable<Memory["stats"]> {
    return Memory.stats!;
}

describe("telemetry", () => {
    beforeEach(() => {
        telemetry._resetHeapForTest();
        sent = [];
        telemetry._setNotifyForTest((message, groupMinutes) => sent.push({ message, groupMinutes }));
    });

    it("accumulates entry stats in the window and folds them on flush", () => {
        telemetry.beginTick(10);
        telemetry.reporter.entryRan(SubsystemId.Shell, null, 1.5);
        telemetry.reporter.entryRan(SubsystemId.Shell, null, 1.5);
        telemetry.reporter.entrySkipped(SubsystemId.TelemetryFlush, null, SkipReason.Bucket);
        telemetry.countError(SubsystemId.Shell, new Error("bad"));
        telemetry.endTick(5, 20, 9000);
        telemetry.flush();

        const window = stats().ring[0];
        expect(window.t).to.equal(10);
        expect(window.ticks).to.equal(1);
        expect(window.avgCpu).to.equal(5);
        expect(window.maxCpu).to.equal(5);
        expect(window.minBucket).to.equal(9000);
        expect(window.entries[SubsystemId.Shell]).to.deep.equal({ c: 3, r: 2, s: 0, e: 1 });
        expect(window.entries[SubsystemId.TelemetryFlush]).to.deep.equal({ c: 0, r: 0, s: 1, e: 0 });
        expect(stats().counters.errors).to.equal(1);
        expect(stats().counters.ticks).to.equal(1);
    });

    it("flushing an empty window is a no-op", () => {
        telemetry.flush();
        expect(Memory.stats === undefined || stats().ring.length === 0).to.equal(true);
    });

    it("wraps the ring at RING_SIZE, overwriting the oldest window", () => {
        for (let i = 1; i <= CFG.RING_SIZE + 2; i++) {
            telemetry.beginTick(i * 100);
            telemetry.endTick(1, 20, 10000);
            telemetry.flush();
        }
        expect(stats().ring).to.have.length(CFG.RING_SIZE);
        expect(stats().head).to.equal(2);
        expect(stats().ring[0].t).to.equal((CFG.RING_SIZE + 1) * 100);
        expect(stats().ring[1].t).to.equal((CFG.RING_SIZE + 2) * 100);
    });

    it("persists resets immediately, bounded to RECENT_RESETS", () => {
        for (let i = 1; i <= CFG.RECENT_RESETS + 2; i++) {
            telemetry.countReset(i * 5000);
        }
        expect(stats().counters.resets).to.equal(CFG.RECENT_RESETS + 2);
        expect(stats().recentResets).to.have.length(CFG.RECENT_RESETS);
        expect(stats().recentResets[0]).to.equal(3 * 5000);
    });

    it("alerts ResetLoop from persisted reset history, deduped across heap wipes", () => {
        telemetry.countReset(100);
        telemetry.countReset(200);
        telemetry.countReset(300);
        const loopAlerts = sent.filter(n => n.message.includes(AlertKind.ResetLoop));
        expect(loopAlerts).to.have.length(1);

        telemetry._resetHeapForTest();
        telemetry.countReset(400);
        expect(sent.filter(n => n.message.includes(AlertKind.ResetLoop))).to.have.length(1);
    });

    it("alerts CpuCeiling from endTick once the window is big enough", () => {
        for (let t = 1; t <= CFG.ALERT_MIN_WINDOW_TICKS; t++) {
            telemetry.beginTick(t);
            telemetry.endTick(19, 20, 10000);
        }
        expect(sent.filter(n => n.message.includes(AlertKind.CpuCeiling))).to.have.length(1);
    });

    it("alerts ErrorBurst when window errors exceed the threshold", () => {
        for (let i = 0; i <= CFG.ERROR_BURST_THRESHOLD; i++) {
            telemetry.countError(SubsystemId.Shell, "err");
        }
        for (let t = 1; t <= CFG.ALERT_MIN_WINDOW_TICKS; t++) {
            telemetry.beginTick(t);
            telemetry.endTick(1, 20, 10000);
        }
        expect(sent.filter(n => n.message.includes(AlertKind.ErrorBurst))).to.have.length(1);
    });

    it("passes the explicit notify group interval on every alert", () => {
        telemetry.beginTick(50);
        telemetry.alert(AlertKind.RoomLost, "test");
        expect(sent).to.have.length(1);
        expect(sent[0].groupMinutes).to.equal(CFG.ALERT_GROUP_MINUTES);
    });

    it("dedupes alerts per kind for ALERT_DEDUPE_TICKS via the persisted stamp", () => {
        telemetry.beginTick(1000);
        telemetry.alert(AlertKind.RoomLost, "one");
        telemetry.beginTick(1000 + CFG.ALERT_DEDUPE_TICKS - 1);
        telemetry.alert(AlertKind.RoomLost, "two");
        expect(sent).to.have.length(1);
        telemetry.beginTick(1000 + CFG.ALERT_DEDUPE_TICKS);
        telemetry.alert(AlertKind.RoomLost, "three");
        expect(sent).to.have.length(2);
    });

    it("never evaluates log thunks below the active level", () => {
        telemetry.countReset(1); // forces Memory.stats to exist
        stats().logLevel = LogLevel.Warn;
        let debugCalls = 0;
        let warnCalls = 0;
        telemetry.log.debug(SubsystemId.Shell, () => {
            debugCalls++;
            return "debug";
        });
        telemetry.log.warn(SubsystemId.Shell, () => {
            warnCalls++;
            return "warn";
        });
        expect(debugCalls).to.equal(0);
        expect(warnCalls).to.equal(1);
    });

    it("swallows internal failures instead of throwing into the tick", () => {
        telemetry._setNotifyForTest(() => {
            throw new Error("notify exploded");
        });
        telemetry.beginTick(1);
        expect(() => telemetry.alert(AlertKind.Discontinuity, "boom")).to.not.throw();
    });

    it("reinitializes a version-mismatched stats slice", () => {
        (Memory as { stats?: unknown }).stats = { v: STATS_VERSION + 1 };
        telemetry.countReset(10);
        expect(stats().v).to.equal(STATS_VERSION);
        expect(stats().counters.resets).to.equal(1);
    });

    it("keeps a worst-case ring under the 10 KB size budget", () => {
        const ids = Object.values(SubsystemId);
        for (let i = 1; i <= CFG.RING_SIZE; i++) {
            telemetry.beginTick(i * CFG.FLUSH_INTERVAL);
            for (const id of ids) {
                telemetry.reporter.entryRan(id, null, 12.345);
                telemetry.reporter.entrySkipped(id, null, SkipReason.CpuHeadroom);
            }
            telemetry.endTick(19.99, 20, 123);
            telemetry.flush();
        }
        expect(JSON.stringify(Memory.stats).length).to.be.lessThan(10 * 1024);
    });
});
