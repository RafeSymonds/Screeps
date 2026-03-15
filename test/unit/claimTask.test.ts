import { assert } from "chai";
import { resetScreeps, createRoom, registerObject } from "../helpers/screeps-fixture";

describe("ClaimTask", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("creates valid claim task data", () => {
        const { createClaimTaskData } = require("../../src/tasks/definitions/ClaimTask");
        const { TaskKind } = require("../../src/tasks/core/TaskKind");

        const data = createClaimTaskData("W1N0", "W0N0");

        assert.equal(data.id, "Claim-W1N0");
        assert.equal(data.kind, TaskKind.CLAIM);
        assert.equal(data.targetRoom, "W1N0");
        assert.equal(data.ownerRoom, "W0N0");
        assert.deepEqual(data.assignedCreeps, []);
    });

    it("is invalid when room is already owned", () => {
        createRoom({
            name: "W1N0",
            my: true,
            level: 2
        });

        const { ClaimTask } = require("../../src/tasks/definitions/ClaimTask");
        const { TaskKind } = require("../../src/tasks/core/TaskKind");

        const task = new ClaimTask({
            id: "Claim-W1N0",
            kind: TaskKind.CLAIM,
            targetRoom: "W1N0",
            ownerRoom: "W0N0",
            assignedCreeps: []
        });

        assert.isFalse(task.isStillValid(), "should be invalid when target is already owned");
    });

    it("accepts creeps with CLAIM body part from owner room", () => {
        const { ClaimTask } = require("../../src/tasks/definitions/ClaimTask");
        const { TaskKind } = require("../../src/tasks/core/TaskKind");

        const task = new ClaimTask({
            id: "Claim-W1N0",
            kind: TaskKind.CLAIM,
            targetRoom: "W1N0",
            ownerRoom: "W0N0",
            assignedCreeps: []
        });

        const claimCreep = {
            creep: {
                body: [{ type: CLAIM }, { type: MOVE }],
                pos: new RoomPosition(25, 25, "W0N0")
            },
            memory: { ownerRoom: "W0N0" }
        };

        const nonClaimCreep = {
            creep: {
                body: [{ type: WORK }, { type: MOVE }],
                pos: new RoomPosition(25, 25, "W0N0")
            },
            memory: { ownerRoom: "W0N0" }
        };

        const wrongRoomCreep = {
            creep: {
                body: [{ type: CLAIM }, { type: MOVE }],
                pos: new RoomPosition(25, 25, "W2N0")
            },
            memory: { ownerRoom: "W2N0" }
        };

        assert.isTrue(task.canPerformTask(claimCreep as any, {} as any), "should accept CLAIM creep from owner room");
        assert.isFalse(task.canPerformTask(nonClaimCreep as any, {} as any), "should reject non-CLAIM creep");
        assert.isFalse(task.canPerformTask(wrongRoomCreep as any, {} as any), "should reject creep from wrong room");
    });

    it("limits to 1 assigned creep", () => {
        const { ClaimTask } = require("../../src/tasks/definitions/ClaimTask");
        const { TaskKind } = require("../../src/tasks/core/TaskKind");

        const task = new ClaimTask({
            id: "Claim-W1N0",
            kind: TaskKind.CLAIM,
            targetRoom: "W1N0",
            ownerRoom: "W0N0",
            assignedCreeps: [["creep1" as any, "claimer1"]]
        });

        // taskIsFull is protected, test via canAcceptCreep
        const creep = {
            creep: { body: [{ type: CLAIM }, { type: MOVE }], id: "creep2" },
            memory: { ownerRoom: "W0N0" }
        };

        assert.isFalse(task.canAcceptCreep(creep as any, {} as any), "should not accept more than 1 creep");
    });
});
