import { assert } from "chai";
import { resetScreeps, createRoom, setExits } from "../helpers/screeps-fixture";

describe("ExpansionPlan", () => {
    beforeEach(() => {
        resetScreeps();
        (global as any).Game.gcl = { level: 3, progress: 0, progressTotal: 100 };
        (global as any).Game.market = {
            calcTransactionCost: () => 500,
            getAllOrders: () => [],
            deal: () => OK
        };
    });

    it("creates claim task when room is in surplus with good target", () => {
        const addedTasks: any[] = [];

        createRoom({
            name: "W0N0",
            my: true,
            level: 6,
            energyCapacityAvailable: 1800,
            storageEnergy: 100000,
            spawns: [{ id: "spawn1", pos: new RoomPosition(25, 25, "W0N0") }]
        });

        (global as any).Memory.rooms["W0N0"].growth = {
            stage: "surplus",
            desiredRemoteCount: 3,
            expansionScore: 150,
            nextClaimTarget: "W4N0",
            expansionReady: true,
            lastEvaluated: 1
        };

        (global as any).Memory.rooms["W0N0"].spawnStats = {
            lastUpdated: Game.time,
            mine: { supplyParts: 5, supplyCreeps: 1, demandParts: 0, demandCreeps: 0, idleCreeps: 0, pressure: 0 },
            carry: { supplyParts: 4, supplyCreeps: 1, demandParts: 0, demandCreeps: 0, idleCreeps: 0, pressure: 0 },
            work: { supplyParts: 10, supplyCreeps: 2, demandParts: 0, demandCreeps: 0, idleCreeps: 0, pressure: 0 },
            scout: { supplyParts: 0, supplyCreeps: 0, demandParts: 0, demandCreeps: 0, idleCreeps: 0, pressure: 0 },
            combat: { supplyParts: 0, supplyCreeps: 0, demandParts: 0, demandCreeps: 0, idleCreeps: 0, pressure: 0 },
            attack: { supplyParts: 0, supplyCreeps: 0, demandParts: 0, demandCreeps: 0, idleCreeps: 0, pressure: 0 }
        };

        (global as any).Memory.rooms["W4N0"] = {
            assistRadius: 2,
            remoteRadius: 2,
            remoteMining: {
                lastHarvestTick: 0,
                sources: [
                    ["s1", new RoomPosition(10, 10, "W4N0")],
                    ["s2", new RoomPosition(40, 40, "W4N0")]
                ],
                ownerRoom: undefined
            },
            intel: { lastScouted: 1, hasEnemyBase: false, hasInvaderCore: false, keeperLairs: 0 }
        };

        setExits({
            W0N0: { 3: "W1N0" },
            W1N0: { 7: "W0N0", 3: "W2N0" },
            W2N0: { 7: "W1N0", 3: "W3N0" },
            W3N0: { 7: "W2N0", 3: "W4N0" },
            W4N0: { 7: "W3N0" }
        });

        const { ExpansionPlan } = require("../../src/plans/definitions/ExpansionPlan");
        const plan = new ExpansionPlan();

        const world = {
            rooms: new Map([["W0N0", { room: (global as any).Game.rooms["W0N0"] }]]),
            taskManager: {
                tasks: new Map(),
                add(data: any) {
                    addedTasks.push(data);
                    this.tasks.set(data.id, data);
                }
            }
        };

        plan.run(world);

        assert.isAtLeast(addedTasks.length, 1, "should create claim task");
        assert.include(addedTasks[0].id, "Claim-W4N0");
    });

    it("does not expand when GCL is at capacity", () => {
        (global as any).Game.gcl = { level: 1, progress: 0, progressTotal: 100 };

        const addedTasks: any[] = [];

        createRoom({
            name: "W0N0",
            my: true,
            level: 6,
            energyCapacityAvailable: 1800,
            storageEnergy: 100000,
            spawns: [{ id: "spawn1", pos: new RoomPosition(25, 25, "W0N0") }]
        });

        (global as any).Memory.rooms["W0N0"].growth = {
            stage: "surplus",
            desiredRemoteCount: 3,
            expansionScore: 150,
            nextClaimTarget: "W1N0",
            expansionReady: true,
            lastEvaluated: 1
        };

        const { ExpansionPlan } = require("../../src/plans/definitions/ExpansionPlan");
        const plan = new ExpansionPlan();

        const world = {
            rooms: new Map([["W0N0", { room: (global as any).Game.rooms["W0N0"] }]]),
            taskManager: {
                tasks: new Map(),
                add(data: any) {
                    addedTasks.push(data);
                }
            }
        };

        plan.run(world);

        assert.lengthOf(addedTasks, 0, "should not expand when GCL = owned room count");
    });

    it("does not expand when storage energy is too low", () => {
        (global as any).Game.gcl = { level: 3 };

        const addedTasks: any[] = [];

        createRoom({
            name: "W0N0",
            my: true,
            level: 6,
            energyCapacityAvailable: 1800,
            storageEnergy: 10000, // below threshold
            spawns: [{ id: "spawn1", pos: new RoomPosition(25, 25, "W0N0") }]
        });

        (global as any).Memory.rooms["W0N0"].growth = {
            stage: "surplus",
            desiredRemoteCount: 3,
            expansionScore: 150,
            nextClaimTarget: "W1N0",
            expansionReady: true,
            lastEvaluated: 1
        };

        const { ExpansionPlan } = require("../../src/plans/definitions/ExpansionPlan");
        const plan = new ExpansionPlan();

        const world = {
            rooms: new Map([["W0N0", { room: (global as any).Game.rooms["W0N0"] }]]),
            taskManager: {
                tasks: new Map(),
                add(data: any) {
                    addedTasks.push(data);
                }
            }
        };

        plan.run(world);

        assert.lengthOf(addedTasks, 0, "should not expand with low storage energy");
    });
});
