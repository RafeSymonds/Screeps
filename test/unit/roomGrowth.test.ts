import { assert } from "chai";
import { updateRoomGrowth } from "../../src/rooms/RoomGrowth";
import { createRoom, resetScreeps, setExits } from "../helpers/screeps-fixture";

describe("updateRoomGrowth", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("classifies strong rooms as surplus and selects a claim target", () => {
        createRoom({ name: "W0N0", my: true, level: 6, energyCapacityAvailable: 1800, storageEnergy: 200000 });
        (global as any).Memory.rooms["W1N0"] = {
            remoteMining: {
                lastHarvestTick: 0,
                sources: [["s1", new RoomPosition(10, 10, "W1N0")]],
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

        const growth = updateRoomGrowth((global as any).Game.rooms["W0N0"]);

        assert.equal(growth.stage, "surplus");
        assert.equal(growth.desiredRemoteCount, 3);
        assert.equal(growth.nextClaimTarget, "W1N0");
    });
});
