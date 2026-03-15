import { assert } from "chai";
import { resetScreeps, createRoom } from "../helpers/screeps-fixture";

describe("LinkPlan", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("transfers energy from source link to sink link", () => {
        const transfers: any[] = [];

        const sinkLink = {
            id: "link-sink",
            structureType: "link" as any,
            pos: new RoomPosition(25, 25, "W0N0"),
            cooldown: 0,
            store: {
                getUsedCapacity: () => 0,
                getFreeCapacity: () => 800
            },
            transferEnergy(target: any) {
                transfers.push({ from: "sink", to: target.id });
                return OK;
            }
        };

        const sourceLink = {
            id: "link-source",
            structureType: "link" as any,
            pos: new RoomPosition(10, 10, "W0N0"),
            cooldown: 0,
            store: {
                getUsedCapacity: () => 400,
                getFreeCapacity: () => 400
            },
            transferEnergy(target: any) {
                transfers.push({ from: "source", to: target.id });
                return OK;
            }
        };

        const spawn = {
            id: "spawn1",
            pos: new RoomPosition(25, 24, "W0N0"),
            structureType: "spawn" as any
        };

        createRoom({
            name: "W0N0",
            my: true,
            level: 5,
            energyCapacityAvailable: 1300,
            spawns: [spawn],
            myStructures: [spawn, sinkLink, sourceLink]
        });

        const { LinkPlan } = require("../../src/plans/defintions/LinkPlan");
        const plan = new LinkPlan();
        plan.run({ rooms: new Map([["W0N0", { room: (global as any).Game.rooms["W0N0"] }]]) });

        assert.lengthOf(transfers, 1, "source link should transfer to sink link");
        assert.equal(transfers[0].from, "source");
        assert.equal(transfers[0].to, "link-sink");
    });

    it("does not transfer when source link has low energy", () => {
        const transfers: any[] = [];

        const sinkLink = {
            id: "link-sink",
            structureType: "link" as any,
            pos: new RoomPosition(25, 25, "W0N0"),
            cooldown: 0,
            store: {
                getUsedCapacity: () => 0,
                getFreeCapacity: () => 800
            },
            transferEnergy() {
                transfers.push("sink");
                return OK;
            }
        };

        const sourceLink = {
            id: "link-source",
            structureType: "link" as any,
            pos: new RoomPosition(10, 10, "W0N0"),
            cooldown: 0,
            store: {
                getUsedCapacity: () => 50, // below 100 threshold
                getFreeCapacity: () => 750
            },
            transferEnergy() {
                transfers.push("source");
                return OK;
            }
        };

        createRoom({
            name: "W0N0",
            my: true,
            level: 5,
            energyCapacityAvailable: 1300,
            spawns: [{ id: "spawn1", pos: new RoomPosition(25, 24, "W0N0"), structureType: "spawn" }],
            myStructures: [
                { id: "spawn1", pos: new RoomPosition(25, 24, "W0N0"), structureType: "spawn" },
                sinkLink,
                sourceLink
            ]
        });

        const { LinkPlan } = require("../../src/plans/defintions/LinkPlan");
        const plan = new LinkPlan();
        plan.run({ rooms: new Map([["W0N0", { room: (global as any).Game.rooms["W0N0"] }]]) });

        assert.lengthOf(transfers, 0, "should not transfer with < 100 energy");
    });

    it("skips rooms below RCL 5", () => {
        const transfers: any[] = [];

        const link = {
            id: "link1",
            structureType: "link" as any,
            pos: new RoomPosition(25, 25, "W0N0"),
            cooldown: 0,
            store: { getUsedCapacity: () => 400, getFreeCapacity: () => 400 },
            transferEnergy() { transfers.push("transfer"); return OK; }
        };

        createRoom({
            name: "W0N0",
            my: true,
            level: 4, // below RCL 5
            energyCapacityAvailable: 800,
            spawns: [{ id: "spawn1", pos: new RoomPosition(25, 24, "W0N0"), structureType: "spawn" }],
            myStructures: [link]
        });

        const { LinkPlan } = require("../../src/plans/defintions/LinkPlan");
        const plan = new LinkPlan();
        plan.run({ rooms: new Map([["W0N0", { room: (global as any).Game.rooms["W0N0"] }]]) });

        assert.lengthOf(transfers, 0, "should not run in RCL 4 rooms");
    });
});
