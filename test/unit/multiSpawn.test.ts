import { assert } from "chai";
import { SpawnManager } from "../../src/spawner/SpawnManager";
import { CreepState } from "../../src/creeps/CreepState";
import { createRoom, resetScreeps } from "../helpers/screeps-fixture";

describe("Multi-Spawn Support", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("uses multiple spawns in the same tick when available", () => {
        const spawnCalls: any[] = [];

        function makeSpawn(id: string) {
            return {
                id,
                name: id,
                pos: new RoomPosition(25, 25, "W0N0"),
                spawning: false,
                spawnCreep(body: BodyPartConstant[], name: string, opts: any) {
                    spawnCalls.push({ spawnId: id, body, name, opts });
                    return OK;
                }
            };
        }

        const spawn1 = makeSpawn("spawn1");
        const spawn2 = makeSpawn("spawn2");

        const room = createRoom({
            name: "W0N0",
            my: true,
            level: 7,
            energyCapacityAvailable: 1300,
            spawns: [spawn1, spawn2]
        });

        const world = {
            rooms: new Map([
                [
                    room.name,
                    {
                        room,
                        myCreeps: [] as CreepState[]
                    }
                ]
            ]),
            taskManager: {
                getTasksForRoom() {
                    return [
                        {
                            requirements() {
                                return {
                                    mine: { parts: 10, creeps: 2 }
                                };
                            }
                        }
                    ];
                }
            }
        } as any;

        new SpawnManager().run(world);

        assert.isAtLeast(spawnCalls.length, 2, "should use both spawns");

        // Creep names should be unique (include spawn name)
        const names = spawnCalls.map(c => c.name);
        const unique = new Set(names);
        assert.equal(unique.size, names.length, "creep names should be unique across spawns");
    });

    it("skips busy spawns but uses idle ones", () => {
        const spawnCalls: any[] = [];

        const busySpawn = {
            id: "spawn1",
            name: "spawn1",
            pos: new RoomPosition(25, 25, "W0N0"),
            spawning: true,
            spawnCreep() {
                spawnCalls.push("spawn1");
                return OK;
            }
        };

        const idleSpawn = {
            id: "spawn2",
            name: "spawn2",
            pos: new RoomPosition(25, 25, "W0N0"),
            spawning: false,
            spawnCreep(body: BodyPartConstant[], name: string, opts: any) {
                spawnCalls.push({ body, name });
                return OK;
            }
        };

        const room = createRoom({
            name: "W0N0",
            my: true,
            level: 7,
            energyCapacityAvailable: 1300,
            spawns: [busySpawn, idleSpawn]
        });

        const world = {
            rooms: new Map([
                [room.name, { room, myCreeps: [] as CreepState[] }]
            ]),
            taskManager: {
                getTasksForRoom() {
                    return [
                        {
                            requirements() {
                                return { mine: { parts: 5, creeps: 1 } };
                            }
                        }
                    ];
                }
            }
        } as any;

        new SpawnManager().run(world);

        assert.lengthOf(spawnCalls, 1, "only idle spawn should fire");
        assert.isObject(spawnCalls[0], "should be from spawn2");
    });

    it("does nothing when all spawns are busy", () => {
        const spawnCalls: any[] = [];

        const spawn = {
            id: "spawn1",
            name: "spawn1",
            pos: new RoomPosition(25, 25, "W0N0"),
            spawning: true,
            spawnCreep() {
                spawnCalls.push("called");
                return OK;
            }
        };

        const room = createRoom({
            name: "W0N0",
            my: true,
            level: 3,
            energyCapacityAvailable: 300,
            spawns: [spawn]
        });

        const world = {
            rooms: new Map([
                [room.name, { room, myCreeps: [] as CreepState[] }]
            ]),
            taskManager: {
                getTasksForRoom() {
                    return [{ requirements() { return { mine: { parts: 5, creeps: 1 } }; } }];
                }
            }
        } as any;

        new SpawnManager().run(world);

        assert.lengthOf(spawnCalls, 0, "busy spawn should not be used");
    });
});
