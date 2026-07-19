import { expect } from "../helpers/chai";
import { JobBoard } from "jobs/JobBoard";
import { SpawnManager } from "spawn/SpawnManager";
import { SpawnRequestQueue } from "spawn/queue";
import { SpawnRole } from "spawn/types";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { makeCreep, makePos } from "../helpers/mock";

interface SpawnCapture {
    body?: BodyPartConstant[];
    memory?: CreepMemory;
}

function fakeRoom(capture: SpawnCapture, energy = 300): WorldRoom {
    const spawn = {
        spawning: false,
        spawnCreep: (body: BodyPartConstant[], _name: string, opts: { memory: CreepMemory }) => {
            capture.body = body;
            capture.memory = opts.memory;
            return OK;
        }
    };
    return {
        name: "W1N1",
        spawns: [spawn],
        sources: [{}],
        towers: [],
        energyAvailable: energy,
        energyCapacityAvailable: energy
    } as unknown as WorldRoom;
}

describe("SpawnManager", () => {
    it("spawns a worker via the floor when the room has no creeps", () => {
        const capture: SpawnCapture = {};
        const worldRoom = fakeRoom(capture);
        const world = { myRooms: [worldRoom], creepsForRoom: () => [] } as unknown as World;
        const board = new JobBoard();
        board.rehydrate();

        new SpawnManager().run(world, board, new SpawnRequestQueue());

        expect(capture.body, "should have spawned").to.not.equal(undefined);
        expect(capture.memory?.spawnRole).to.equal(SpawnRole.Worker);
        expect(capture.memory?.home).to.equal("W1N1");
        expect(capture.memory?.working).to.equal(false);
    });

    it("prioritizes a controller spawn request over economy demand", () => {
        const capture: SpawnCapture = {};
        const worldRoom = fakeRoom(capture);
        // A pretend existing worker so the floor does not fire.
        const existing = { getActiveBodyparts: (part: BodyPartConstant) => (part === WORK ? 1 : 1), memory: {} };
        const world = { myRooms: [worldRoom], creepsForRoom: () => [existing] } as unknown as World;
        const board = new JobBoard();
        board.rehydrate();

        const queue = new SpawnRequestQueue();
        queue.push({ key: "def", roomName: "W1N1", role: SpawnRole.Defender, priority: 200, owner: "defense" });

        new SpawnManager().run(world, board, queue);

        expect(capture.memory?.spawnRole).to.equal(SpawnRole.Defender);
        expect(capture.memory?.controller).to.equal("defense");
    });

    it("falls back to economy when the top request is unaffordable (no spawn freeze)", () => {
        // The freeze bug: a pending 650-energy reserver in a room holding less used
        // to block ALL spawning — dead economy creeps went unreplaced while the
        // request sat unaffordable. The request must be skipped, not block.
        const capture: SpawnCapture = {};
        const worldRoom = fakeEconomyRoom(capture, { energy: 300, capacity: 1300 });
        const existing = makeCreep({ body: [WORK, CARRY, MOVE], memory: { home: "W1N1" } });
        const world = {
            myRooms: [worldRoom],
            creeps: [existing],
            creepsForRoom: () => [existing]
        } as unknown as World;

        const queue = new SpawnRequestQueue();
        queue.push({ key: "remote-reserve:W2N1", roomName: "W1N1", role: SpawnRole.Claimer, priority: 30, owner: "remote-reserve:W2N1" });

        new SpawnManager().run(world, new JobBoard(), queue);

        expect(capture.memory, "economy should have spawned past the unaffordable request").to.not.equal(undefined);
        expect(capture.memory?.spawnRole).to.not.equal(SpawnRole.Claimer);
    });

    it("still honors the request once the room can afford it", () => {
        const capture: SpawnCapture = {};
        const worldRoom = fakeEconomyRoom(capture, { energy: 700, capacity: 1300 });
        const existing = makeCreep({ body: [WORK, CARRY, MOVE], memory: { home: "W1N1" } });
        const world = {
            myRooms: [worldRoom],
            creeps: [existing],
            creepsForRoom: () => [existing]
        } as unknown as World;

        const queue = new SpawnRequestQueue();
        queue.push({ key: "remote-reserve:W2N1", roomName: "W1N1", role: SpawnRole.Claimer, priority: 30, owner: "remote-reserve:W2N1" });

        new SpawnManager().run(world, new JobBoard(), queue);

        expect(capture.memory?.spawnRole).to.equal(SpawnRole.Claimer);
    });

    it("the recovery floor preempts pending requests in a wiped room", () => {
        // A room with no working creep has no income: banking toward a request would
        // deadlock it. The floor Worker must spawn first, request or not.
        const capture: SpawnCapture = {};
        const worldRoom = fakeEconomyRoom(capture, { energy: 300, capacity: 1300 });
        const world = { myRooms: [worldRoom], creeps: [], creepsForRoom: () => [] } as unknown as World;

        const queue = new SpawnRequestQueue();
        queue.push({ key: "def", roomName: "W1N1", role: SpawnRole.Defender, priority: 200, owner: "defense" });

        new SpawnManager().run(world, new JobBoard(), queue);

        expect(capture.memory?.spawnRole).to.equal(SpawnRole.Worker);
    });

    it("tags a remote miner decision with a travel-capable body", () => {
        // Economy path picks a remote miner (home fully staffed, remote deficit):
        // the spawned body must pair MOVE with WORK, unlike the parked home miner.
        const capture: SpawnCapture = {};
        const worldRoom = fakeEconomyRoom(capture, { energy: 1300, capacity: 1300 });
        // Home fully staffed: a 5-WORK dedicated miner and a hauler cover the one
        // source, so pickRoomLabor extends to the remote's deficit.
        const homeMiner = makeCreep({
            body: [WORK, WORK, WORK, WORK, WORK, MOVE],
            memory: { home: "W1N1", spawnRole: SpawnRole.Miner }
        });
        const homeHauler = makeCreep({
            body: Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? CARRY : MOVE)),
            memory: { home: "W1N1", spawnRole: SpawnRole.Hauler }
        });
        const upgrader = makeCreep({ body: [WORK, CARRY, MOVE], memory: { home: "W1N1" } });
        const creeps = [homeMiner, homeHauler, upgrader];
        const world = {
            myRooms: [worldRoom],
            creeps,
            creepsForRoom: () => creeps
        } as unknown as World;
        Memory.empire = {
            remotes: {
                W2N1: { roomName: "W2N1", owner: "W1N1", sources: ["sa"], distance: 50, active: true, reserve: false }
            }
        };

        new SpawnManager().run(world, new JobBoard(), queue());

        expect(capture.memory?.spawnRole).to.equal(SpawnRole.Miner);
        expect(capture.memory?.targetRoom).to.equal("W2N1");
        const moves = capture.body?.filter(part => part === MOVE).length ?? 0;
        const works = capture.body?.filter(part => part === WORK).length ?? 0;
        expect(moves).to.equal(works);
    });
});

/** Empty request queue. */
function queue(): SpawnRequestQueue {
    return new SpawnRequestQueue();
}

/**
 * A room rich enough for the ECONOMY decision path (pickRoomLabor → roomDemand),
 * which touches sources/storage/spawn positions and the flow-model accessors.
 */
function fakeEconomyRoom(capture: SpawnCapture, opts: { energy: number; capacity: number }): WorldRoom {
    const spawn = {
        pos: makePos(25, 25),
        spawning: false,
        spawnCreep: (body: BodyPartConstant[], _name: string, callOpts: { memory: CreepMemory }) => {
            capture.body = body;
            capture.memory = callOpts.memory;
            return OK;
        }
    };
    return {
        name: "W1N1",
        rcl: 4,
        spawns: [spawn],
        sources: [{ pos: makePos(20, 20) }],
        storage: undefined,
        towers: [],
        energyAvailable: opts.energy,
        energyCapacityAvailable: opts.capacity,
        storageEnergy: () => 0,
        backlogEnergy: () => 0
    } as unknown as WorldRoom;
}
