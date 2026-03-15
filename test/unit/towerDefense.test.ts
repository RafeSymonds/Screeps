import { assert } from "chai";
import { resetScreeps } from "../helpers/screeps-fixture";

// We test the tower defense logic indirectly via the exported function
// by constructing world rooms with towers and hostiles.

// Import the internal helpers by re-implementing the logic for testing
// since performTowerDefense depends on the World type.

describe("Tower Defense - Rampart Repair", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("repairs ramparts when no hostiles are present", () => {
        const repaired: any[] = [];
        const tower = {
            pos: new RoomPosition(25, 25, "W0N0"),
            store: {
                getUsedCapacity: () => 800
            },
            attack() {},
            heal() {},
            repair(target: any) {
                repaired.push(target);
                return OK;
            }
        };

        const rampart = {
            structureType: "rampart" as any,
            hits: 500,
            hitsMax: 300000000,
            pos: new RoomPosition(24, 24, "W0N0")
        };

        const { performTowerDefense } = require("../../src/combat/TowerDefense");

        const world = {
            rooms: new Map([
                [
                    "W0N0",
                    {
                        room: {
                            name: "W0N0",
                            controller: { level: 5, my: true },
                            find(type: number) {
                                if (type === FIND_HOSTILE_CREEPS) return [];
                                if (type === (global as any).FIND_MY_STRUCTURES) return [tower];
                                if (type === FIND_STRUCTURES) return [rampart];
                                // FIND_MY_CREEPS
                                return [];
                            }
                        },
                        towers: [tower],
                        hostileCreeps: [],
                        myCreeps: []
                    }
                ]
            ])
        };

        performTowerDefense(world);

        assert.isAtLeast(repaired.length, 1, "tower should repair the low-HP rampart");
        assert.equal(repaired[0].structureType, "rampart");
    });

    it("prioritizes attacking hostiles over repairing ramparts", () => {
        const attacked: any[] = [];
        const repaired: any[] = [];

        const tower = {
            pos: new RoomPosition(25, 25, "W0N0"),
            store: { getUsedCapacity: () => 800 },
            attack(target: any) {
                attacked.push(target);
                return OK;
            },
            heal() {},
            repair(target: any) {
                repaired.push(target);
                return OK;
            }
        };

        const hostile = {
            pos: new RoomPosition(26, 26, "W0N0"),
            body: [{ type: "attack" }],
            hits: 100,
            hitsMax: 100
        };

        const rampart = {
            structureType: "rampart" as any,
            hits: 100,
            hitsMax: 300000000,
            pos: new RoomPosition(24, 24, "W0N0")
        };

        const { selectPriorityHostile } = require("../../src/combat/CombatUtils");

        const { performTowerDefense } = require("../../src/combat/TowerDefense");

        const world = {
            rooms: new Map([
                [
                    "W0N0",
                    {
                        room: {
                            name: "W0N0",
                            controller: { level: 5, my: true },
                            find(type: number) {
                                if (type === FIND_HOSTILE_CREEPS) return [hostile];
                                if (type === FIND_STRUCTURES) return [rampart];
                                return [];
                            }
                        },
                        towers: [tower],
                        hostileCreeps: [hostile],
                        myCreeps: []
                    }
                ]
            ])
        };

        performTowerDefense(world);

        assert.isAtLeast(attacked.length, 1, "should attack hostiles");
        assert.lengthOf(repaired, 0, "should not repair when hostiles present");
    });

    it("repairs walls alongside ramparts based on HP target", () => {
        const repaired: any[] = [];

        const tower = {
            pos: new RoomPosition(25, 25, "W0N0"),
            store: { getUsedCapacity: () => 800 },
            attack() {},
            heal() {},
            repair(target: any) {
                repaired.push(target);
                return OK;
            }
        };

        const wall = {
            structureType: "constructedWall" as any,
            hits: 1,
            hitsMax: 300000000,
            pos: new RoomPosition(20, 20, "W0N0")
        };

        const rampart = {
            structureType: "rampart" as any,
            hits: 50000,
            hitsMax: 300000000,
            pos: new RoomPosition(24, 24, "W0N0")
        };

        const { performTowerDefense } = require("../../src/combat/TowerDefense");

        const world = {
            rooms: new Map([
                [
                    "W0N0",
                    {
                        room: {
                            name: "W0N0",
                            controller: { level: 5, my: true },
                            find(type: number) {
                                if (type === FIND_HOSTILE_CREEPS) return [];
                                if (type === FIND_STRUCTURES) return [wall, rampart];
                                return [];
                            }
                        },
                        towers: [tower],
                        hostileCreeps: [],
                        myCreeps: []
                    }
                ]
            ])
        };

        performTowerDefense(world);

        assert.isAtLeast(repaired.length, 1, "should repair fortifications");
        // Wall has lowest hits (1), should be repaired first
        assert.equal(repaired[0].structureType, "constructedWall");
    });
});
