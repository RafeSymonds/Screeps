import { expect } from "../helpers/chai";
import { JobBoard, isJobValid } from "jobs/JobBoard";
import { Job, JobKind } from "jobs/types";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { generateRepairJobs } from "jobs/generators/RepairJobGenerator";

// REPAIR_THRESHOLD is 0.6: a structure is a target while hits/hitsMax < 0.6.
function road(hits: number, hitsMax = 5000): unknown {
    return { structureType: STRUCTURE_ROAD, hits, hitsMax };
}
function container(hits: number, hitsMax = 250000): unknown {
    return { structureType: STRUCTURE_CONTAINER, hits, hitsMax };
}

function makeRoom(structures: unknown[]): Room {
    return {
        name: "W1N1",
        controller: undefined,
        storage: undefined,
        find: (type: number) => (type === FIND_STRUCTURES ? structures : [])
    } as unknown as Room;
}

function fakeWorldRoom(targets: unknown[]): WorldRoom {
    return { name: "W1N1", repairTargets: () => targets } as unknown as WorldRoom;
}

function repairJob(): Job {
    return {
        id: "repair:W1N1",
        kind: JobKind.Repair,
        roomName: "W1N1",
        capacity: 1,
        assigned: [],
        priority: 50,
        demand: { work: 1, carry: 1 }
    };
}

describe("WorldRoom.repairTargets", () => {
    it("includes decayed structures and excludes healthy ones", () => {
        const wr = new WorldRoom(makeRoom([road(1000), road(4000), container(1000)]));
        // road 0.2 in, road 0.8 out, container ~0 in.
        expect(wr.repairTargets().length).to.equal(2);
    });

    it("returns a cached array on repeated calls", () => {
        const wr = new WorldRoom(makeRoom([road(1000)]));
        expect(wr.repairTargets()).to.equal(wr.repairTargets());
    });
});

describe("generateRepairJobs", () => {
    it("upserts a room-level repair job when something is damaged", () => {
        const board = new JobBoard();
        board.rehydrate();
        generateRepairJobs(fakeWorldRoom([road(1000)]), board);
        const job = board.get("repair:W1N1");
        expect(job?.kind).to.equal(JobKind.Repair);
        expect(job?.capacity).to.equal(1);
    });

    it("emits nothing when nothing is damaged", () => {
        const board = new JobBoard();
        board.rehydrate();
        generateRepairJobs(fakeWorldRoom([]), board);
        expect(board.get("repair:W1N1")).to.equal(undefined);
    });
});

describe("isJobValid (repair)", () => {
    function worldWith(getRoom: (name: string) => unknown): World {
        return { getRoom } as unknown as World;
    }

    it("keeps the job while damaged structures remain", () => {
        const world = worldWith(() => ({ repairTargets: () => [road(1000)] }));
        expect(isJobValid(repairJob(), world)).to.equal(true);
    });

    it("invalidates the job once nothing needs repair", () => {
        const world = worldWith(() => ({ repairTargets: () => [] }));
        expect(isJobValid(repairJob(), world)).to.equal(false);
    });

    it("keeps the job when the room is not visible (stale-tolerant)", () => {
        const world = worldWith(() => undefined);
        expect(isJobValid(repairJob(), world)).to.equal(true);
    });
});
