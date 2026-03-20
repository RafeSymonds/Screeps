import { assert } from "chai";
import { EconomyPlan } from "../../src/plans/definitions/EconomyPlan";
import { TaskKind } from "../../src/tasks/core/TaskKind";
import { createRoom, createSource, resetScreeps } from "../helpers/screeps-fixture";

function positionKey(pos: RoomPosition): string {
    return `${pos.roomName}:${pos.x}:${pos.y}`;
}

describe("EconomyPlan", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("adds early position drop hotspots for spawn, controller, and construction clusters", () => {
        const room = createRoom({
            name: "W0N0",
            my: true,
            level: 2,
            energyCapacityAvailable: 300,
            spawns: [{ id: "spawn1", pos: new RoomPosition(10, 10, "W0N0") }]
        });
        const source = createSource("source1", room.name, 5, 5);
        const site = { id: "site1", pos: new RoomPosition(20, 20, room.name), structureType: STRUCTURE_EXTENSION } as any;
        const originalFind = room.find.bind(room);
        (room as any).find = (type: any) => {
            if (type === FIND_SOURCES) return [source];
            if (type === FIND_CONSTRUCTION_SITES) return [site];
            return originalFind(type);
        };

        const added: any[] = [];
        const world = {
            rooms: new Map([[room.name, { room }]]),
            taskManager: {
                add(task: any) {
                    added.push(task);
                }
            }
        } as any;

        new EconomyPlan().run(world);

        const positionDeliverTasks = added.filter(
            task => task.kind === TaskKind.DELIVER && task.target.kind === "position"
        );
        const keys = new Set(positionDeliverTasks.map(task => positionKey(task.target.position)));

        assert.isAtLeast(positionDeliverTasks.length, 3);
        assert.isTrue(keys.has("W0N0:9:9")); // spawn hotspot
        assert.isTrue(keys.has("W0N0:24:24")); // controller hotspot (controller at 25,25)
        assert.isTrue(keys.has("W0N0:19:19")); // construction hotspot
    });

    it("skips hotspot drop sinks when the tile is already buffered with dropped energy", () => {
        const room = createRoom({
            name: "W0N0",
            my: true,
            level: 2,
            energyCapacityAvailable: 300,
            spawns: [{ id: "spawn1", pos: new RoomPosition(10, 10, "W0N0") }]
        });
        const source = createSource("source1", room.name, 5, 5);
        const spawnHotspot = new RoomPosition(9, 9, room.name);
        const dropped = {
            id: "drop1",
            resourceType: RESOURCE_ENERGY,
            amount: 500,
            pos: spawnHotspot
        };

        const originalFind = room.find.bind(room);
        (room as any).find = (type: any) => {
            if (type === FIND_SOURCES) return [source];
            if (type === FIND_DROPPED_RESOURCES) return [dropped];
            return originalFind(type);
        };

        const added: any[] = [];
        const world = {
            rooms: new Map([[room.name, { room }]]),
            taskManager: {
                add(task: any) {
                    added.push(task);
                }
            }
        } as any;

        new EconomyPlan().run(world);

        const positionDeliverTasks = added.filter(
            task => task.kind === TaskKind.DELIVER && task.target.kind === "position"
        );
        const keys = new Set(positionDeliverTasks.map(task => positionKey(task.target.position)));

        assert.isFalse(keys.has("W0N0:9:9"));
    });
});
