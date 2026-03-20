import { assert } from "chai";
import { BuildTask, createBuildTaskData } from "../../src/tasks/definitions/BuildTask";
import { createUpgradeTaskData, UpgradeTask } from "../../src/tasks/definitions/UpgradeTask";
import { createRepairTaskData, RepairTask } from "../../src/tasks/definitions/RepairTask";
import { createRoom, registerObject, resetScreeps } from "../helpers/screeps-fixture";

function makeCreep(room: Room, name: string, parts: BodyPartConstant[]): Creep {
    return {
        id: `${name}-id`,
        name,
        body: parts.map(type => ({ type })),
        memory: { ownerRoom: room.name, taskTicks: 0, working: false },
        store: {
            getUsedCapacity: () => 50,
            getFreeCapacity: () => 50,
            getCapacity: () => 100
        },
        pos: new RoomPosition(15, 15, room.name),
        room,
        spawning: false
    } as unknown as Creep;
}

describe("Task role affinity", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("prefers workers over miners for build tasks", () => {
        const room = createRoom({ name: "W0N0", my: true, level: 3, energyCapacityAvailable: 300 });
        const site = registerObject({
            id: "site1",
            pos: new RoomPosition(16, 16, room.name),
            structureType: STRUCTURE_EXTENSION
        } as unknown as ConstructionSite);
        const task = new BuildTask(createBuildTaskData(site));

        const worker = makeCreep(room, "worker", [WORK, CARRY, CARRY, MOVE, MOVE]);
        const miner = makeCreep(room, "miner", [WORK, WORK, CARRY, MOVE]);

        (global as any).Memory.rooms[room.name].growth = { stage: "bootstrap" };
        const bootstrapGap = task.score(worker) - task.score(miner);

        (global as any).Memory.rooms[room.name].growth = { stage: "surplus" };
        const surplusGap = task.score(worker) - task.score(miner);

        assert.isAbove(bootstrapGap, 0);
        assert.isAbove(surplusGap, bootstrapGap);
    });

    it("prefers workers over miners for upgrade tasks", () => {
        const room = createRoom({ name: "W0N0", my: true, level: 3, energyCapacityAvailable: 300 });
        const controller = registerObject({
            id: "controller1",
            pos: new RoomPosition(25, 25, room.name)
        } as unknown as StructureController);
        const task = new UpgradeTask(createUpgradeTaskData(controller));

        const worker = makeCreep(room, "worker", [WORK, CARRY, CARRY, MOVE, MOVE]);
        const miner = makeCreep(room, "miner", [WORK, WORK, CARRY, MOVE]);

        assert.isAbove(task.score(worker), task.score(miner));
    });

    it("prefers workers over haulers for repair tasks", () => {
        const room = createRoom({ name: "W0N0", my: true, level: 3, energyCapacityAvailable: 300 });
        const road = registerObject({
            id: "road1",
            pos: new RoomPosition(18, 18, room.name),
            hits: 100,
            hitsMax: 500
        } as unknown as Structure);
        const task = new RepairTask(createRepairTaskData(road));

        const worker = makeCreep(room, "worker", [WORK, CARRY, CARRY, MOVE, MOVE]);
        const hauler = makeCreep(room, "hauler", [CARRY, CARRY, MOVE, MOVE]);

        assert.isAbove(task.score(worker), task.score(hauler));
    });
});
