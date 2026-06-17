import { expect } from "../helpers/chai";
import { JobBoard } from "jobs/JobBoard";
import { SpawnManager } from "spawn/SpawnManager";
import { SpawnRequestQueue } from "spawn/queue";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";

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
    it("spawns a generalist via the floor when the room has no creeps", () => {
        const capture: SpawnCapture = {};
        const worldRoom = fakeRoom(capture);
        const world = { myRooms: [worldRoom], creepsForRoom: () => [] } as unknown as World;
        const board = new JobBoard();
        board.rehydrate();

        new SpawnManager().run(world, board, new SpawnRequestQueue());

        expect(capture.body, "should have spawned").to.not.equal(undefined);
        expect(capture.memory?.spawnRole).to.equal("generalist");
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
        queue.push({ key: "def", roomName: "W1N1", role: "defender", priority: 200, owner: "defense" });

        new SpawnManager().run(world, board, queue);

        expect(capture.memory?.spawnRole).to.equal("defender");
        expect(capture.memory?.controller).to.equal("defense");
    });
});
