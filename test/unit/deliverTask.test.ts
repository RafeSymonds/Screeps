import { assert } from "chai";
import { createDeliverTaskData, DeliverTask } from "../../src/tasks/definitions/DeliverTask";
import { CreepState } from "../../src/creeps/CreepState";
import { createRoom, resetScreeps } from "../helpers/screeps-fixture";

function makeCreep(
    room: Room,
    name: string,
    parts: BodyPartConstant[],
    energy: number
): Creep {
    return {
        id: `${name}-id`,
        name,
        body: parts.map(type => ({ type })),
        memory: { ownerRoom: room.name, taskTicks: 0, working: false },
        store: {
            getUsedCapacity: () => energy,
            getFreeCapacity: () => Math.max(0, 100 - energy),
            getCapacity: () => 100
        },
        pos: new RoomPosition(25, 25, room.name),
        room,
        spawning: false
    } as unknown as Creep;
}

describe("DeliverTask", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("lets workers deliver as fallback but strongly prefers haulers", () => {
        const room = createRoom({ name: "W0N0", my: true, level: 3, energyCapacityAvailable: 300 });
        const dropPos = new RoomPosition(20, 20, room.name);
        const task = new DeliverTask(createDeliverTaskData(dropPos));

        const worker = makeCreep(room, "worker1", [WORK, CARRY, MOVE], 80);
        const hauler = makeCreep(room, "hauler1", [CARRY, CARRY, MOVE, MOVE], 80);

        const world = {
            resourceManager: {
                roomHasEnoughEnergy: () => true
            }
        } as any;

        const workerState = new CreepState(worker, worker.memory);
        const haulerState = new CreepState(hauler, hauler.memory);

        assert.isTrue(task.canPerformTask(workerState, world));
        assert.isTrue(task.canPerformTask(haulerState, world));
        assert.isAbove(task.score(hauler), task.score(worker));
    });

    it("uses looser role preference in bootstrap and tighter in surplus", () => {
        const room = createRoom({ name: "W0N0", my: true, level: 3, energyCapacityAvailable: 300 });
        const dropPos = new RoomPosition(20, 20, room.name);
        const task = new DeliverTask(createDeliverTaskData(dropPos));

        const worker = makeCreep(room, "worker2", [WORK, CARRY, MOVE], 80);
        const hauler = makeCreep(room, "hauler2", [CARRY, CARRY, MOVE, MOVE], 80);

        (global as any).Memory.rooms[room.name].growth = { stage: "bootstrap" };
        const bootstrapGap = task.score(hauler) - task.score(worker);

        (global as any).Memory.rooms[room.name].growth = { stage: "surplus" };
        const surplusGap = task.score(hauler) - task.score(worker);

        assert.isAbove(surplusGap, bootstrapGap);
    });
});
