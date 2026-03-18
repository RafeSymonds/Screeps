import { assert } from "chai";
import { InfrastructurePlan } from "../../src/plans/definitions/InfrastructurePlan";
import { createRoom, getConstructionSites, resetScreeps } from "../helpers/screeps-fixture";

describe("infrastructure planning", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("places source containers and roads for owned and active remote mining", () => {
        const spawn = {
            id: "spawn1",
            pos: new RoomPosition(25, 25, "W0N0"),
            spawning: false
        };
        const ownedRoom = createRoom({
            name: "W0N0",
            my: true,
            level: 4,
            energyCapacityAvailable: 800,
            spawns: [spawn],
            sources: [
                {
                    id: "owned-source",
                    pos: new RoomPosition(10, 10, "W0N0")
                }
            ]
        });
        createRoom({
            name: "W1N0",
            my: false,
            level: 1,
            energyCapacityAvailable: 300,
            sources: [
                {
                    id: "remote-source",
                    pos: new RoomPosition(12, 12, "W1N0")
                }
            ]
        });

        (global as any).Memory.rooms["W1N0"] = {
            remoteMining: {
                lastHarvestTick: 0,
                sources: [["remote-source", new RoomPosition(12, 12, "W1N0")]],
                ownerRoom: "W0N0"
            },
            remoteStrategy: {
                state: "active",
                ownerRoom: "W0N0",
                routeLength: 1,
                score: 100,
                sourceCount: 1,
                lastEvaluated: 1
            },
            numHarvestSpots: 0,
            assistRadius: 2,
            remoteRadius: 2
        };

        new InfrastructurePlan().run({
            rooms: new Map([[ownedRoom.name, { room: ownedRoom }]])
        } as any);

        const sites = getConstructionSites();
        const siteTypes = sites.map(site => `${site.pos.roomName}:${site.structureType}`);

        assert.include(siteTypes, "W0N0:container");
        assert.include(siteTypes, "W0N0:road");
        assert.include(siteTypes, "W1N0:container");
        assert.include(siteTypes, "W1N0:road");
    });
});
