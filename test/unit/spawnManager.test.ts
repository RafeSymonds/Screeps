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
            energyCapacityAvailable: 300,
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
                            }
                        }
                    ];
                }
            }
        } as any;

        new SpawnManager().run(world);

        assert.lengthOf(spawnCalls, 1);
        assert.deepEqual(spawnCalls[0].body, [MOVE, CARRY, WORK]);
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
                            }
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

    it("does not spawn baseline workers before miner+hauler pipeline exists even with high work demand", () => {
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

        (global as any).Memory.rooms[room.name].spawnRequests = [
            {
                role: "worker",
                priority: SpawnRequestPriority.EMERGENCY + 50,
                desiredCreeps: 2,
                expiresAt: 99999,
                requestedBy: "baseline:worker:W0N0",
                minEnergy: 200
            }
        ];

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
                                    mine: { parts: 5, creeps: 1 },
                                    work: { parts: 15, creeps: 2 }
                                };
                            }
                        }
                    ];
                }
            }
        } as any;

        new SpawnManager().run(world);

        assert.lengthOf(spawnCalls, 1);
        assert.match(spawnCalls[0].name, /^MINER-/);
    });

    it("spawns hauler second, then allows workers after pipeline and mining throughput", () => {
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
                            }
                        }
                    ];
                }
            }
        } as any;

        new SpawnManager().run(world);

        assert.lengthOf(spawnCalls, 1);
        assert.match(spawnCalls[0].name, /^HAULER-/);

        const hauler = {
            id: "hauler1",
            name: "hauler1",
            body: [{ type: CARRY }, { type: CARRY }, { type: MOVE }, { type: MOVE }],
            memory: { ownerRoom: "W0N0", taskTicks: 0, working: true },
            store: {
                getUsedCapacity: () => 0,
                getFreeCapacity: () => 100,
                getCapacity: () => 100
            },
            pos: new RoomPosition(25, 25, "W0N0"),
            room,
            spawning: false
        } as unknown as Creep;

        const bigMiner = {
            id: "minerBig",
            name: "minerBig",
            body: [
                { type: MOVE },
                { type: CARRY },
                { type: WORK },
                { type: WORK },
                { type: WORK },
                { type: WORK },
                { type: WORK }
            ],
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

        const world2 = {
            rooms: new Map([
                [
                    room.name,
                    {
                        room,
                        myCreeps: [new CreepState(bigMiner, bigMiner.memory), new CreepState(hauler, hauler.memory)]
                    }
                ]
            ]),
            taskManager: world.taskManager
        } as any;

        new SpawnManager().run(world2);

        assert.match(spawnCalls[1].name, /^WORKER-/);
    });
});
