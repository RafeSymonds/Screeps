import { assert } from "chai";
import { refreshRemoteStrategies } from "../../src/rooms/RemoteStrategy";
import { createRoom, resetScreeps, setExits } from "../helpers/screeps-fixture";

describe("refreshRemoteStrategies", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("assigns remotes to the best safe owner and saturates extras", () => {
        createRoom({ name: "W0N0", my: true, level: 4, energyCapacityAvailable: 1300, spawns: [{ id: "spawnA", pos: new RoomPosition(25, 25, "W0N0") }] });
        createRoom({ name: "W2N0", my: true, level: 4, energyCapacityAvailable: 800, spawns: [{ id: "spawnB", pos: new RoomPosition(25, 25, "W2N0") }] });
        (global as any).Memory.rooms["W0N0"].growth = { stage: "surplus", desiredRemoteCount: 1, expansionScore: 100, lastEvaluated: 1 };
        (global as any).Memory.rooms["W2N0"].growth = { stage: "remote", desiredRemoteCount: 1, expansionScore: 50, lastEvaluated: 1 };
        (global as any).Memory.rooms["W0N0"].spawnStats = { mine: { pressure: 0 }, carry: { pressure: 0 } };
        (global as any).Memory.rooms["W2N0"].spawnStats = { mine: { pressure: 0.5 }, carry: { pressure: 0.5 } };

        (global as any).Memory.rooms["W1N0"] = {
            remoteMining: {
                lastHarvestTick: 0,
                sources: [["r1s1", new RoomPosition(10, 10, "W1N0")]],
                ownerRoom: undefined
            },
            intel: { lastScouted: 1, hasEnemyBase: false, hasInvaderCore: false, keeperLairs: 0 },
            numHarvestSpots: 0,
            assistRadius: 2,
            remoteRadius: 2
        };
        (global as any).Memory.rooms["W3N0"] = {
            remoteMining: {
                lastHarvestTick: 0,
                sources: [["r2s1", new RoomPosition(10, 10, "W3N0")]],
                ownerRoom: undefined
            },
            intel: { lastScouted: 1, hasEnemyBase: false, hasInvaderCore: false, keeperLairs: 0 },
            numHarvestSpots: 0,
            assistRadius: 2,
            remoteRadius: 2
        };
        setExits({
            W0N0: { 3: "W1N0" },
            W1N0: { 7: "W0N0", 3: "W2N0" },
            W2N0: { 7: "W1N0", 3: "W3N0" },
            W3N0: { 7: "W2N0" }
        });

        refreshRemoteStrategies();

        assert.equal((global as any).Memory.rooms["W1N0"].remoteStrategy.state, "active");
        assert.equal((global as any).Memory.rooms["W1N0"].remoteStrategy.ownerRoom, "W0N0");
        assert.equal((global as any).Memory.rooms["W3N0"].remoteStrategy.state, "active");
        assert.equal((global as any).Memory.rooms["W3N0"].remoteStrategy.ownerRoom, "W2N0");
    });
});
