import { expect } from "../helpers/chai";
import { JobBoard } from "jobs/JobBoard";
import { Job } from "jobs/types";

function harvestJob(over: Partial<Job> = {}): Job {
    return {
        id: "harvest:s1",
        kind: "harvest",
        roomName: "W1N1",
        targetId: "s1",
        capacity: 2,
        assigned: [],
        priority: 80,
        demand: { work: 2, carry: 1 },
        ...over
    };
}

describe("JobBoard", () => {
    it("upserts idempotently by id and preserves sticky assignments", () => {
        const board = new JobBoard();
        board.rehydrate();
        board.upsert(harvestJob());
        Memory.creeps["c1"] = { jobId: "harvest:s1" } as unknown as CreepMemory;
        board.assign("c1", "harvest:s1");

        board.upsert(harvestJob({ priority: 90 })); // regeneration next tick

        const job = board.get("harvest:s1");
        expect(board.all().length).to.equal(1);
        expect(job?.assigned).to.deep.equal(["c1"]);
        expect(job?.priority).to.equal(90);
    });

    it("reconcile drops dead creeps from assigned lists", () => {
        const board = new JobBoard();
        board.rehydrate();
        board.upsert(harvestJob());
        Memory.creeps["c1"] = { jobId: "harvest:s1" } as unknown as CreepMemory;
        board.assign("c1", "harvest:s1");

        // c1 is not in Game.creeps -> treated as dead.
        board.reconcile();
        expect(board.get("harvest:s1")?.assigned).to.deep.equal([]);
    });

    it("demand counts open slots only", () => {
        const board = new JobBoard();
        board.rehydrate();
        board.upsert(harvestJob({ capacity: 2 }));
        const demand = board.demand("W1N1");
        expect(demand.work).to.equal(4); // 2 work/slot * 2 open slots
        expect(demand.carry).to.equal(2);
    });

    it("round-trips through Memory.jobs", () => {
        const board = new JobBoard();
        board.rehydrate();
        board.upsert(harvestJob());
        board.persist();
        expect(Object.keys(Memory.jobs)).to.deep.equal(["harvest:s1"]);

        const reloaded = new JobBoard();
        reloaded.rehydrate();
        expect(reloaded.get("harvest:s1")?.kind).to.equal("harvest");
    });
});
