import { expect } from "../helpers/chai";
import { JobBoard } from "jobs/JobBoard";
import { JobKind } from "jobs/types";
import { economyCreepsToMatch } from "matching/Matcher";
import { World } from "world/World";
import { makeCreep, makeStore } from "../helpers/mock";

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
