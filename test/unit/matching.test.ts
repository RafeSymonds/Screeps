import { expect } from "../helpers/chai";
import { JobBoard } from "jobs/JobBoard";
import { Job, JobKind } from "jobs/types";
import { GreedyMatcher, economyCreepsToMatch } from "matching/Matcher";
import { World } from "world/World";
import { makeCreep, makeStore } from "../helpers/mock";

/** A board job with sensible defaults; only id/kind/capacity/priority are required. */
function job(over: Partial<Job> & Pick<Job, "id" | "kind" | "capacity" | "priority">): Job {
    return {
        roomName: "W1N1",
        assigned: [],
        demand: { work: 1, carry: 1 },
        ...over
    } as Job;
}

/** A WORK+CARRY worker (capable of build, upgrade, haul, harvest). */
function worker(name: string, memory: Partial<CreepMemory> = {}): Creep {
    return makeCreep({ name, body: [WORK, CARRY, MOVE], memory });
}

describe("GreedyMatcher — priority ladder, upgrade as residual sink", () => {
    // jobNeeded only special-cases harvest/haul, so build/upgrade are always "needed"
    // here; world is unused for those kinds. The ranking under test is priority-first.
    const noWorld = {} as unknown as World;

    it("fills a higher-priority job before a less-staffed lower-priority one", () => {
        const board = new JobBoard();
        board.rehydrate();
        // Build (60) already has one creep; upgrade (40) is empty. Old fewest-assigned
        // ranking would pick upgrade; the priority ladder must pick build.
        board.upsert(job({ id: "build:W1N1", kind: JobKind.Build, capacity: 3, priority: 60, assigned: ["a"] }));
        board.upsert(job({ id: "upgrade:W1N1", kind: JobKind.Upgrade, capacity: 12, priority: 40, targetId: "ctrl" }));

        const w = worker("w");
        new GreedyMatcher().assign([w], board, noWorld);

        expect(board.get("build:W1N1")!.assigned).to.include("w");
        expect(board.get("upgrade:W1N1")!.assigned).to.not.include("w");
    });

    it("falls to upgrade only once the higher-priority jobs are full (residual sink)", () => {
        const board = new JobBoard();
        board.rehydrate();
        board.upsert(job({ id: "build:W1N1", kind: JobKind.Build, capacity: 1, priority: 60, assigned: ["full"] }));
        board.upsert(job({ id: "upgrade:W1N1", kind: JobKind.Upgrade, capacity: 12, priority: 40, targetId: "ctrl" }));

        const w = worker("w");
        new GreedyMatcher().assign([w], board, noWorld);

        expect(board.get("upgrade:W1N1")!.assigned).to.include("w");
    });
});

describe("GreedyMatcher — room scope (remote pinning)", () => {
    const noWorld = {} as unknown as World;

    it("a home creep only takes jobs in its home room, even a higher-priority one elsewhere", () => {
        const board = new JobBoard();
        board.rehydrate();
        board.upsert(job({ id: "build:W1N1", kind: JobKind.Build, capacity: 1, priority: 60 }));
        board.upsert(job({ id: "build:W2N1", kind: JobKind.Build, capacity: 1, priority: 99, roomName: "W2N1" }));

        const w = worker("w", { home: "W1N1" });
        new GreedyMatcher().assign([w], board, noWorld);

        expect(board.get("build:W1N1")!.assigned).to.include("w");
        expect(board.get("build:W2N1")!.assigned).to.not.include("w");
    });

    it("a remote creep (targetRoom) is pinned to its target room", () => {
        const board = new JobBoard();
        board.rehydrate();
        board.upsert(job({ id: "build:W1N1", kind: JobKind.Build, capacity: 1, priority: 99 }));
        board.upsert(job({ id: "build:W2N1", kind: JobKind.Build, capacity: 1, priority: 60, roomName: "W2N1" }));

        const w = worker("w", { home: "W1N1", targetRoom: "W2N1" });
        new GreedyMatcher().assign([w], board, noWorld);

        expect(board.get("build:W2N1")!.assigned).to.include("w");
        expect(board.get("build:W1N1")!.assigned).to.not.include("w");
    });

    it("a jobless remote creep with no eligible remote job falls back to home work", () => {
        // The scope-lock idle bug: an active remote briefly loses its jobs (intel gap)
        // or has every slot taken — its pinned creeps must take home work, not idle.
        const board = new JobBoard();
        board.rehydrate();
        board.upsert(job({ id: "build:W1N1", kind: JobKind.Build, capacity: 1, priority: 60 }));

        const w = worker("w", { home: "W1N1", targetRoom: "W2N1" });
        new GreedyMatcher().assign([w], board, noWorld);

        expect(board.get("build:W1N1")!.assigned).to.include("w");
    });

    it("a remote creep holding its remote job is never poached onto home work", () => {
        // The fallback fires only for creeps holding NOTHING: an assigned remote
        // creep whose job has no open slots elsewhere stays put (the pin).
        const board = new JobBoard();
        board.rehydrate();
        board.upsert(job({ id: "build:W1N1", kind: JobKind.Build, capacity: 1, priority: 99 }));
        board.upsert(job({ id: "build:W2N1", kind: JobKind.Build, capacity: 1, priority: 60, roomName: "W2N1", assigned: ["w"] }));

        const w = worker("w", { home: "W1N1", targetRoom: "W2N1", jobId: "build:W2N1" });
        new GreedyMatcher().assign([w], board, noWorld);

        expect(board.get("build:W2N1")!.assigned).to.include("w");
        expect(board.get("build:W1N1")!.assigned).to.not.include("w");
    });

    it("a fallback-assigned creep is pulled back the moment a remote job opens", () => {
        // While on home work the held job is out of the creep's strict scope, so a
        // reappearing remote job wins immediately.
        const board = new JobBoard();
        board.rehydrate();
        board.upsert(job({ id: "build:W1N1", kind: JobKind.Build, capacity: 1, priority: 99, assigned: ["w"] }));
        board.upsert(job({ id: "build:W2N1", kind: JobKind.Build, capacity: 1, priority: 60, roomName: "W2N1" }));

        const w = worker("w", { home: "W1N1", targetRoom: "W2N1", jobId: "build:W1N1" });
        // In production creep.memory IS Memory.creeps[name]; unassign reads it there.
        Memory.creeps.w = w.memory;
        new GreedyMatcher().assign([w], board, noWorld);

        expect(board.get("build:W2N1")!.assigned).to.include("w");
        expect(board.get("build:W1N1")!.assigned).to.not.include("w");
    });
});

describe("economyCreepsToMatch (re-decide when empty)", () => {
    it("includes creeps with no job and empty creeps, excludes mid-work and controller-owned", () => {
        const board = new JobBoard();
        board.rehydrate();
        board.upsert({
            id: "j1",
            kind: JobKind.Upgrade,
            roomName: "W1N1",
            capacity: 2,
            assigned: [],
            priority: 1,
            demand: { work: 1, carry: 1 }
        });

        // Carrying energy → mid-work, keep its job. Empty → reconsider before gathering.
        const midWork = makeCreep({ name: "midWork", memory: { jobId: "j1" }, store: makeStore(10) });
        const emptyAssigned = makeCreep({ name: "emptyAssigned", memory: { jobId: "j1" }, store: makeStore(0) });
        const idle = makeCreep({ name: "idle", memory: {} });
        const owned = makeCreep({ name: "owned", memory: { controller: "combat:op1" } });
        const world = { creeps: [midWork, emptyAssigned, idle, owned] } as unknown as World;

        const result = economyCreepsToMatch(world, board);
        expect(result.map(creep => creep.name).sort()).to.deep.equal(["emptyAssigned", "idle"]);
    });

    it("re-includes a creep whose job no longer exists", () => {
        const board = new JobBoard();
        board.rehydrate();
        const stale = makeCreep({ name: "stale", memory: { jobId: "gone" } });
        const world = { creeps: [stale] } as unknown as World;
        expect(economyCreepsToMatch(world, board).map(creep => creep.name)).to.deep.equal(["stale"]);
    });
});
