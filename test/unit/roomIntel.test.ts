import { assert } from "chai";
import { recordRoom, intelStatus, IntelStatus } from "../../src/rooms/RoomIntel";
import { resetScreeps, createRoom } from "../helpers/screeps-fixture";

describe("RoomIntel", () => {
    beforeEach(() => {
        resetScreeps();
    });

    describe("recordRoom", () => {
        it("records hostile military presence", () => {
            const hostile = {
                pos: new RoomPosition(20, 20, "W0N0"),
                body: [
                    { type: ATTACK },
                    { type: ATTACK },
                    { type: HEAL },
                    { type: MOVE }
                ]
            };

            createRoom({
                name: "W0N0",
                level: 3,
                structures: []
            });

            // Override find to return our hostile
            const room = (global as any).Game.rooms["W0N0"];
            const originalFind = room.find.bind(room);
            room.find = (type: number) => {
                if (type === FIND_HOSTILE_CREEPS) return [hostile];
                return originalFind(type);
            };

            recordRoom(room);

            const intel = room.memory.intel;
            assert.equal(intel.lastScouted, (global as any).Game.time);
            assert.equal(intel.hostileMilitaryParts, 3, "should count ATTACK + HEAL parts");
            assert.equal(intel.lastHostileSeen, (global as any).Game.time);
        });

        it("preserves lastHostileSeen when no hostiles present", () => {
            createRoom({
                name: "W0N0",
                level: 3,
                structures: []
            });

            const room = (global as any).Game.rooms["W0N0"];
            const originalFind = room.find.bind(room);
            room.find = (type: number) => {
                if (type === FIND_HOSTILE_CREEPS) return [];
                return originalFind(type);
            };

            // Set previous hostile seen
            room.memory.intel = { lastHostileSeen: 50 };

            recordRoom(room);

            assert.equal(room.memory.intel.lastHostileSeen, 50, "should preserve previous value");
            assert.equal(room.memory.intel.hostileMilitaryParts, 0);
        });

        it("records source information for remote mining", () => {
            const source = {
                id: "src1",
                pos: new RoomPosition(10, 10, "W0N0")
            };

            createRoom({
                name: "W0N0",
                level: 0,
                sources: [source],
                structures: []
            });

            const room = (global as any).Game.rooms["W0N0"];
            const originalFind = room.find.bind(room);
            room.find = (type: number) => {
                if (type === FIND_HOSTILE_CREEPS) return [];
                return originalFind(type);
            };

            recordRoom(room);

            assert.isOk(room.memory.remoteMining, "should create remoteMining data");
            assert.lengthOf(room.memory.remoteMining.sources, 1);
        });
    });

    describe("intelStatus", () => {
        it("returns UNKNOWN for undefined intel", () => {
            assert.equal(intelStatus(undefined), IntelStatus.UNKNOWN);
        });

        it("returns OPEN for safe rooms", () => {
            const intel = {
                lastScouted: 1,
                hasEnemyBase: false,
                hasInvaderCore: false,
                keeperLairs: 0
            } as any;

            assert.equal(intelStatus(intel), IntelStatus.OPEN);
        });

        it("returns DANGEROUS for rooms with enemy base", () => {
            const intel = {
                lastScouted: 1,
                hasEnemyBase: true,
                hasInvaderCore: false,
                keeperLairs: 0
            } as any;

            assert.equal(intelStatus(intel), IntelStatus.DANGEROUS);
        });

        it("returns DANGEROUS for source keeper rooms", () => {
            const intel = {
                lastScouted: 1,
                hasEnemyBase: false,
                hasInvaderCore: false,
                keeperLairs: 3
            } as any;

            assert.equal(intelStatus(intel), IntelStatus.DANGEROUS);
        });

        it("returns DANGEROUS for rooms with invader cores", () => {
            const intel = {
                lastScouted: 1,
                hasEnemyBase: false,
                hasInvaderCore: true,
                keeperLairs: 0
            } as any;

            assert.equal(intelStatus(intel), IntelStatus.DANGEROUS);
        });
    });
});
