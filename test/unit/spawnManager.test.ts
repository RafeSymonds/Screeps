import { assert } from "chai";
import { SpawnManager } from "../../src/spawner/SpawnManager";
import { SpawnRequestPriority } from "../../src/spawner/SpawnRequests";
import { CreepState } from "../../src/creeps/CreepState";
import { createRoom, resetScreeps } from "../helpers/screeps-fixture";

describe("SpawnManager", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("bootstraps a miner when mining demand exists and no miners are available", () => {
        const spawnCalls: any[] = [];
        const spawn = {
            id: "spawn1",
            pos: new RoomPosition(25, 25, "W0N0"),
            spawning: false,
            spawnCreep(body: BodyPartConstant[], name: string, opts: any) {
                spawnCalls.push({ body, name, opts });
                return OK;
            }
        };
        const room = createRoom({
            name: "W0N0",
            my: true,
            level: 3,
            energyCapacityAvailable: 800,
            spawns: [spawn]
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
                                    mine: {
                                        parts: 5,
                                        creeps: 1
                                    }
                                };
                            },
                            routeLength() { return 1; },
                            type() { return "HARVEST"; }
                        }
                    ];
                }
            }
        } as any;

        new SpawnManager().run(world);

        assert.lengthOf(spawnCalls, 1);
        const body = spawnCalls[0].body;
        assert.equal(body.filter((p: BodyPartConstant) => p === MOVE).length, 1);
        assert.equal(body.filter((p: BodyPartConstant) => p === CARRY).length, 1);
        assert.isAtLeast(body.filter((p: BodyPartConstant) => p === WORK).length, 1);
        assert.match(spawnCalls[0].name, /^MINER-/);
        assert.equal(spawnCalls[0].opts.memory.ownerRoom, "W0N0");
    });

    it("spawns a scout when only vision demand exists", () => {
        const spawnCalls: any[] = [];
        const spawn = {
            id: "spawn1",
            pos: new RoomPosition(25, 25, "W0N0"),
            spawning: false,
            spawnCreep(body: BodyPartConstant[], name: string) {
                spawnCalls.push({ body, name });
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

        const worker = {
            id: "worker1",
            name: "worker1",
            body: [{ type: CARRY }, { type: MOVE }], // Remove WORK to avoid triggering hauler demand via "miner" classification
            memory: { ownerRoom: "W0N0", taskId: "task", taskTicks: 0, working: true },
            store: {
                getUsedCapacity: () => 0,
                getFreeCapacity: () => 50,
                getCapacity: () => 50
            },
            pos: new RoomPosition(25, 25, "W0N0"),
            room,
            spawning: false
        } as unknown as Creep;

        const world = {
            rooms: new Map([
                [
                    room.name,
                    {
                        room,
                        myCreeps: [new CreepState(worker, worker.memory)]
                    }
                ]
            ]),
            taskManager: {
                getTasksForRoom() {
                    return [
                        {
                            requirements() {
                                return { vision: true };
                            },
                            routeLength() { return 1; },
                            type() { return "SCOUT"; }
                        }
                    ];
                }
            }
        } as any;

        new SpawnManager().run(world);

        assert.lengthOf(spawnCalls, 1);
        assert.deepEqual(spawnCalls[0].body, [MOVE]);
        assert.match(spawnCalls[0].name, /^SCOUT-/);
    });

    it("spawns hauler when miner exists and hauling demand is present", () => {
        const spawnCalls: any[] = [];
        const spawn = {
            id: "spawn1",
            pos: new RoomPosition(25, 25, "W0N0"),
            spawning: false,
            spawnCreep(body: BodyPartConstant[], name: string, opts: any) {
                spawnCalls.push({ body, name, opts });
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

        const miner = {
            id: "miner1",
            name: "miner1",
            body: [{ type: MOVE }, { type: CARRY }, { type: WORK }],
            memory: { ownerRoom: "W0N0", taskTicks: 0, working: true },
            store: {
                getUsedCapacity: () => 0,
                getFreeCapacity: () => 50,
                getCapacity: () => 50
            },
            pos: new RoomPosition(25, 25, "W0N0"),
            room,
            spawning: false
        } as unknown as Creep;

        const world = {
            rooms: new Map([
                [
                    room.name,
                    {
                        room,
                        myCreeps: [new CreepState(miner, miner.memory)]
                    }
                ]
            ]),
            taskManager: {
                getTasksForRoom() {
                    return [
                        {
                            requirements() {
                                return {
                                    mine: { parts: 5, creeps: 1 },
                                    work: { parts: 3, creeps: 1 },
                                    carry: { parts: 4, creeps: 1 }
                                };
                            },
                            routeLength() { return 1; },
                            type() { return "HARVEST"; }
                        }
                    ];
                }
            }
        } as any;

        new SpawnManager().run(world);

        assert.lengthOf(spawnCalls, 1);
        assert.match(spawnCalls[0].name, /^HAULER-/);
    });
});
