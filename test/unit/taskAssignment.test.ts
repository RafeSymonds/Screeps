import { assert } from "chai";
import { assignCreeps } from "../../src/tasks/core/TaskAssignment";
import { CreepState } from "../../src/creeps/CreepState";
import { createRoom, resetScreeps } from "../helpers/screeps-fixture";

describe("assignCreeps", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("skips dangerous tasks without override and assigns a safe alternative", () => {
        const room = createRoom({ name: "W0N0", my: true, level: 3, energyCapacityAvailable: 300 });
        (global as any).Memory.rooms["W1N0"] = {
            intel: { lastScouted: 1, hasEnemyBase: true, hasInvaderCore: false, keeperLairs: 0 },
            assistRadius: 2,
            remoteRadius: 2
        };

        const creep = {
            id: "creep1",
            name: "creep1",
            body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
            memory: { ownerRoom: "W0N0", taskTicks: 0, working: false },
            store: {
                getUsedCapacity: () => 0,
                getFreeCapacity: () => 50,
                getCapacity: () => 50
            },
            pos: new RoomPosition(25, 25, "W0N0"),
            room,
            spawning: false
        } as unknown as Creep;

        const assigned: string[] = [];
        const dangerousTask = {
            id: () => "danger",
            data: { id: "danger", targetRoom: "W1N0", kind: 0 },
            type: () => 0,
            isDangerous: () => true,
            allowsDangerousAssignment: () => false,
            canPerformTask: () => true,
            canAcceptCreep: () => true,
            assignmentScore: () => 1000,
            assignCreep: () => {
                assigned.push("danger");
            }
        };
        const safeTask = {
            id: () => "safe",
            data: { id: "safe", targetRoom: "W0N0", kind: 0 },
            type: () => 0,
            isDangerous: () => false,
            allowsDangerousAssignment: () => false,
            canPerformTask: () => true,
            canAcceptCreep: () => true,
            assignmentScore: () => 10,
            assignCreep: () => {
                assigned.push("safe");
            }
        };

        const world = {
            rooms: new Map([
                [
                    room.name,
                    {
                        room,
                        myCreeps: [new CreepState(creep, creep.memory)]
                    }
                ]
            ]),
            taskManager: {
                tasks: new Map(),
                getTasksForRoom() {
                    return [dangerousTask, safeTask];
                }
            }
        } as any;

        assignCreeps(world);

        assert.deepEqual(assigned, ["safe"]);
        assert.equal(creep.memory.taskId, "safe");
    });

    it("uses higher assignment score when multiple safe tasks are available", () => {
        const room = createRoom({ name: "W0N0", my: true, level: 3, energyCapacityAvailable: 300 });
        const creep = {
            id: "creep1",
            name: "creep1",
            body: [{ type: WORK }, { type: CARRY }, { type: MOVE }],
            memory: { ownerRoom: "W0N0", taskTicks: 0, working: false },
            store: {
                getUsedCapacity: () => 0,
                getFreeCapacity: () => 50,
                getCapacity: () => 50
            },
            pos: new RoomPosition(25, 25, "W0N0"),
            room,
            spawning: false
        } as unknown as Creep;

        const assigned: string[] = [];
        const lowTask = {
            id: () => "low",
            data: { id: "low", targetRoom: "W0N0", kind: 0 },
            type: () => 0,
            isDangerous: () => false,
            allowsDangerousAssignment: () => false,
            canPerformTask: () => true,
            canAcceptCreep: () => true,
            assignmentScore: () => 5,
            assignCreep: () => {
                assigned.push("low");
            }
        };
        const highTask = {
            id: () => "high",
            data: { id: "high", targetRoom: "W0N0", kind: 0 },
            type: () => 0,
            isDangerous: () => false,
            allowsDangerousAssignment: () => false,
            canPerformTask: () => true,
            canAcceptCreep: () => true,
            assignmentScore: () => 50,
            assignCreep: () => {
                assigned.push("high");
            }
        };

        const world = {
            rooms: new Map([
                [
                    room.name,
                    {
                        room,
                        myCreeps: [new CreepState(creep, creep.memory)]
                    }
                ]
            ]),
            taskManager: {
                tasks: new Map(),
                getTasksForRoom() {
                    return [lowTask, highTask];
                }
            }
        } as any;

        assignCreeps(world);

        assert.deepEqual(assigned, ["high"]);
        assert.equal(creep.memory.taskId, "high");
    });
});
