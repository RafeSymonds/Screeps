import { expect } from "../helpers/chai";
import { SubsystemId } from "shared/subsystems";
import * as telemetry from "telemetry/index";
import { AlertKind } from "telemetry/index";
import { checkWorldContinuity, LOST_ROOM_GRACE } from "shell/continuity";
import { cleanDeadCreepMemory } from "shell/creepGc";
import { ENTRIES } from "shell/entries";
import { CURRENT_VERSION, ensureAndMigrate, KEEP_ON_RESET, Migration } from "shell/memory";
import { makeCreep } from "../helpers/mock";

function g(): Record<string, any> {
    return global as unknown as Record<string, any>;
}

let sent: string[];

describe("shell", () => {
    beforeEach(() => {
        telemetry._resetHeapForTest();
        sent = [];
        telemetry._setNotifyForTest(message => sent.push(message));
    });

    describe("memory bootstrap", () => {
        it("initializes a fresh world with containers and version", () => {
            ensureAndMigrate();
            expect(Memory.version).to.equal(CURRENT_VERSION);
            expect(Memory.rooms).to.deep.equal({});
            expect(Memory.intel).to.deep.equal({});
            expect(Memory.shell).to.deep.equal({ owned: [], lostAt: {} });
        });

        it("runs the migration ladder in order and lands on CURRENT_VERSION", () => {
            ensureAndMigrate();
            Memory.version = 0;
            const applied: number[] = [];
            const synthetic: Migration[] = [
                { to: 1, run: () => applied.push(1) }
            ];
            ensureAndMigrate(synthetic);
            expect(applied).to.deep.equal([1]);
            expect(Memory.version).to.equal(CURRENT_VERSION);
        });

        it("fails forward past a throwing migration, counting and alerting", () => {
            ensureAndMigrate();
            Memory.version = 0;
            const synthetic: Migration[] = [
                {
                    to: 1,
                    run: () => {
                        throw new Error("bad migration");
                    }
                }
            ];
            expect(() => ensureAndMigrate(synthetic)).to.not.throw();
            expect(Memory.version).to.equal(CURRENT_VERSION);
            expect(sent.some(m => m.includes(AlertKind.CorruptSlice))).to.equal(true);
        });

        it("resets on version rollback but keeps everything in KEEP_ON_RESET", () => {
            ensureAndMigrate();
            Memory.intel = { W5N5: { seen: true } };
            telemetry.countReset(50); // materializes Memory.stats
            const statsBefore = Memory.stats;
            Memory.rooms.W1N1 = {} as RoomMemory;
            Memory.version = CURRENT_VERSION + 5;

            ensureAndMigrate();
            expect(Memory.version).to.equal(CURRENT_VERSION);
            expect(Memory.intel).to.deep.equal({ W5N5: { seen: true } });
            expect(Memory.stats).to.equal(statsBefore);
            expect(Memory.rooms).to.deep.equal({});
            expect(sent.some(m => m.includes(AlertKind.Discontinuity))).to.equal(true);
            expect(KEEP_ON_RESET).to.include.members(["intel", "stats", "version"]);
        });

        it("heals a corrupt container in place", () => {
            ensureAndMigrate();
            (Memory as unknown as Record<string, unknown>).shell = "garbage";
            ensureAndMigrate();
            expect(Memory.shell).to.deep.equal({ owned: [], lostAt: {} });
        });
    });

    describe("world continuity", () => {
        beforeEach(() => {
            ensureAndMigrate();
        });

        it("fresh world: records ownership without alerts", () => {
            checkWorldContinuity(["W1N1"]);
            expect(Memory.shell!.owned).to.deep.equal(["W1N1"]);
            expect(sent).to.have.length(0);
        });

        it("normal continuity: tracks growth quietly", () => {
            checkWorldContinuity(["W1N1"]);
            checkWorldContinuity(["W1N1", "W2N2"]);
            expect(Memory.shell!.owned).to.deep.equal(["W1N1", "W2N2"]);
            expect(sent).to.have.length(0);
        });

        it("partial loss: alerts once per transition and stamps lostAt", () => {
            g().Game.time = 500;
            checkWorldContinuity(["W1N1", "W2N2"]);
            checkWorldContinuity(["W2N2"]);
            expect(sent.filter(m => m.includes(AlertKind.RoomLost))).to.have.length(1);
            expect(Memory.shell!.lostAt).to.deep.equal({ W1N1: 500 });

            checkWorldContinuity(["W2N2"]); // same state next tick — no re-alert
            expect(sent.filter(m => m.includes(AlertKind.RoomLost))).to.have.length(1);
        });

        it("total loss: alerts, records empty ownership, does NOT reset", () => {
            checkWorldContinuity(["W1N1"]);
            Memory.rooms.W1N1 = {} as RoomMemory;
            Memory.intel = { W1N1: { seen: 1 } };
            checkWorldContinuity([]);
            expect(Memory.shell!.owned).to.deep.equal([]);
            expect(sent.filter(m => m.includes(AlertKind.RoomLost))).to.have.length(1);
            expect(Memory.rooms.W1N1).to.deep.equal({});
            expect(Memory.intel).to.deep.equal({ W1N1: { seen: 1 } });

            checkWorldContinuity([]); // dead and waiting — quiet
            expect(sent.filter(m => m.includes(AlertKind.RoomLost))).to.have.length(1);
        });

        it("respawn: selective reset keeps intel and stats, wipes the rest", () => {
            g().Game.time = 100;
            Memory.intel = { W1N1: { seen: 1 } };
            telemetry.countReset(100);
            checkWorldContinuity(["W1N1"]);
            Memory.creeps.ghost = {} as CreepMemory;
            Memory.rooms.W1N1 = {} as RoomMemory;
            checkWorldContinuity([]); // wiped out

            g().Game.time = 5000;
            checkWorldContinuity(["W7N7"]); // respawned elsewhere
            expect(sent.some(m => m.includes(AlertKind.Discontinuity))).to.equal(true);
            expect(Memory.shell).to.deep.equal({ owned: ["W7N7"], lostAt: {} });
            expect(Memory.rooms).to.deep.equal({});
            expect(Memory.creeps).to.deep.equal({});
            expect(Memory.intel).to.deep.equal({ W1N1: { seen: 1 } });
            expect(Memory.stats).to.not.equal(undefined);
        });

        it("respawn into a remembered room still takes the discontinuity path", () => {
            g().Game.time = 100;
            checkWorldContinuity(["W1N1"]);
            Memory.rooms.W1N1 = { stale: true } as unknown as RoomMemory;
            checkWorldContinuity([]);

            g().Game.time = 4000;
            checkWorldContinuity(["W1N1"]); // came back to the same room
            expect(sent.some(m => m.includes(AlertKind.Discontinuity))).to.equal(true);
            expect(Memory.rooms).to.deep.equal({});
        });

        it("treats a remembered world the shell never saw as discontinuity (deploy over foreign Memory)", () => {
            g().Game.time = 10;
            Memory.rooms.W3N3 = { v1Leftover: true } as unknown as RoomMemory;
            Memory.intel = { W3N3: { seen: 1 } };
            checkWorldContinuity(["W1N1"]);
            expect(sent.some(m => m.includes(AlertKind.Discontinuity))).to.equal(true);
            expect(Memory.rooms).to.deep.equal({});
            expect(Memory.intel).to.deep.equal({ W3N3: { seen: 1 } });
            expect(Memory.shell!.owned).to.deep.equal(["W1N1"]);
        });

        it("GCs a lost room's slices only after the grace period", () => {
            g().Game.time = 1000;
            checkWorldContinuity(["W1N1", "W2N2"]);
            Memory.rooms.W1N1 = { plan: 1 } as unknown as RoomMemory;
            checkWorldContinuity(["W2N2"]);
            expect(Memory.rooms.W1N1).to.not.equal(undefined);

            g().Game.time = 1000 + LOST_ROOM_GRACE - 1;
            checkWorldContinuity(["W2N2"]);
            expect(Memory.rooms.W1N1).to.not.equal(undefined);

            g().Game.time = 1000 + LOST_ROOM_GRACE;
            checkWorldContinuity(["W2N2"]);
            expect(Memory.rooms.W1N1).to.equal(undefined);
            expect(Memory.shell!.lostAt).to.deep.equal({});
        });

        it("re-claiming within the grace window clears the pending GC", () => {
            g().Game.time = 1000;
            checkWorldContinuity(["W1N1", "W2N2"]);
            checkWorldContinuity(["W2N2"]);
            expect(Memory.shell!.lostAt.W1N1).to.equal(1000);
            checkWorldContinuity(["W1N1", "W2N2"]);
            expect(Memory.shell!.lostAt).to.deep.equal({});
        });
    });

    describe("dead-creep GC", () => {
        it("removes memories of creeps absent from Game.creeps, keeps the living and spawning", () => {
            Memory.creeps.alive = {} as CreepMemory;
            Memory.creeps.embryo = {} as CreepMemory;
            Memory.creeps.dead = {} as CreepMemory;
            g().Game.creeps.alive = makeCreep({ name: "alive" });
            g().Game.creeps.embryo = makeCreep({ name: "embryo", spawning: true });
            cleanDeadCreepMemory();
            expect(Object.keys(Memory.creeps).sort()).to.deep.equal(["alive", "embryo"]);
        });
    });

    describe("ENTRIES wiring", () => {
        it("has unique ids in the normative order with staggered phases", () => {
            const ids = ENTRIES.map(e => e.id);
            expect(new Set(ids).size).to.equal(ids.length);
            expect(ids).to.deep.equal([
                SubsystemId.Economy,
                SubsystemId.Spawn,
                SubsystemId.CreepExecution,
                SubsystemId.Movement,
                SubsystemId.TelemetryFlush
            ]);

            const byInterval = new Map<number, number[]>();
            for (const entry of ENTRIES) {
                if (entry.interval !== undefined) {
                    const phases = byInterval.get(entry.interval) ?? [];
                    phases.push(entry.phase ?? 0);
                    byInterval.set(entry.interval, phases);
                }
            }
            for (const phases of byInterval.values()) {
                expect(new Set(phases).size).to.equal(phases.length);
            }
        });
    });
});
