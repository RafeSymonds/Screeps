import { assert } from "chai";
import { RemoteMiningPlan } from "../../src/plans/definitions/RemoteMiningPlan";
import { roomCanConsiderTask } from "../../src/tasks/core/TaskDistributor";
import { updateRoomGrowth } from "../../src/rooms/RoomGrowth";
import { updateRoomSupportState } from "../../src/rooms/RoomSupport";
import { createRoom, resetScreeps, setExits } from "../helpers/screeps-fixture";

describe("planning scenarios", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("queues remote tasks only for active remotes", () => {
        const owner = createRoom({
            name: "W0N0",
            my: true,
            level: 4,
            energyCapacityAvailable: 1300,
            spawns: [{ id: "spawn1", pos: new RoomPosition(25, 25, "W0N0") }]
        });

        updateRoomGrowth(owner);

        (global as any).Memory.rooms["W1N0"] = {
            remoteMining: {
                lastHarvestTick: 0,
                sources: [["remoteSource", new RoomPosition(10, 10, "W1N0")]],
                ownerRoom: undefined
            },
            intel: { lastScouted: 1, hasEnemyBase: false, hasInvaderCore: false, keeperLairs: 0 },
            numHarvestSpots: 0,
            assistRadius: 2,
            remoteRadius: 2
        };
        setExits({
            W0N0: { 3: "W1N0" },
            W1N0: { 7: "W0N0" }
        });

        const added: any[] = [];
        const world = {
            taskManager: {
                add(task: any) {
                    added.push(task);
                }
            }
        } as any;

        new RemoteMiningPlan().run(world);

        assert.equal(added.length, 2);
        assert.sameMembers(
            added.map(task => task.kind),
            [2, 3]
        );
        assert.equal(added[0].ownerRoom, "W0N0");
    });

    it("lets mature rooms answer support requests from onboarding rooms", () => {
        const helper = createRoom({
            name: "W0N0",
            my: true,
            level: 5,
            energyCapacityAvailable: 1800,
            spawns: [{ id: "spawnHelper", pos: new RoomPosition(25, 25, "W0N0") }]
        });
        const target = createRoom({
            name: "W1N0",
            my: true,
            level: 1,
            energyCapacityAvailable: 300,
            spawns: []
        });

        updateRoomGrowth(helper);
        updateRoomSupportState(target);
        setExits({
            W0N0: { 3: "W1N0" },
            W1N0: { 7: "W0N0" }
        });

        const task = {
            type: () => 0,
            ownerRoom: () => "W1N0",
            data: { targetRoom: "W1N0" }
        } as any;

        assert.isTrue(roomCanConsiderTask(helper, task));
    });
});
