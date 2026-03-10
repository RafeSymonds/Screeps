import { assert } from "chai";
import { updateRoomSupportState } from "../../src/rooms/RoomSupport";
import { addOwnedCreep, createRoom, resetScreeps } from "../helpers/screeps-fixture";

describe("updateRoomSupportState", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("requests bootstrap support for a newly settled room", () => {
        const room = createRoom({ name: "W0N0", my: true, level: 1, energyCapacityAvailable: 300, spawns: [] });

        const request = updateRoomSupportState(room);

        assert.equal(room.memory.onboarding?.stage, "settling");
        assert.equal(request?.kind, "bootstrap");
        assert.equal(request?.priority, 100);
    });

    it("requests build support when the room is stable but construction backs up", () => {
        const spawn = { id: "spawn1", pos: new RoomPosition(25, 25, "W0N0") };
        const room = createRoom({
            name: "W0N0",
            my: true,
            level: 3,
            energyCapacityAvailable: 800,
            spawns: [spawn],
            constructionSites: [{ id: "site1" }, { id: "site2" }, { id: "site3" }, { id: "site4" }, { id: "site5" }, { id: "site6" }]
        });

        addOwnedCreep("miner1", "W0N0", [WORK, MOVE]);
        addOwnedCreep("hauler1", "W0N0", [CARRY, MOVE]);
        addOwnedCreep("worker1", "W0N0", [WORK, CARRY, MOVE]);

        const request = updateRoomSupportState(room);

        assert.equal(room.memory.onboarding?.stage, "established");
        assert.equal(request?.kind, "build");
    });
});
