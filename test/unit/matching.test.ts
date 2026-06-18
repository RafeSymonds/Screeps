import { expect } from "../helpers/chai";
import { JobBoard } from "jobs/JobBoard";
import { JobKind } from "jobs/types";
import { idleEconomyCreeps } from "matching/Matcher";
import { World } from "world/World";
import { makeCreep } from "../helpers/mock";

describe("idleEconomyCreeps (sticky matching)", () => {
    it("includes idle creeps, excludes assigned and controller-owned creeps", () => {
        const board = new JobBoard();
        board.rehydrate();
        board.upsert({
            id: "j1",
            kind: JobKind.Upgrade,
            roomName: "W1N1",
            capacity: 1,
            assigned: [],
            priority: 1,
            demand: { work: 1, carry: 1 }
        });

        const assigned = makeCreep({ name: "assigned", memory: { jobId: "j1" } });
        const idle = makeCreep({ name: "idle", memory: {} });
        const owned = makeCreep({ name: "owned", memory: { controller: "combat:op1" } });
        const world = { creeps: [assigned, idle, owned] } as unknown as World;

        const result = idleEconomyCreeps(world, board);
        expect(result.map(creep => creep.name)).to.deep.equal(["idle"]);
    });

    it("re-includes a creep whose job no longer exists", () => {
        const board = new JobBoard();
        board.rehydrate();
        const stale = makeCreep({ name: "stale", memory: { jobId: "gone" } });
        const world = { creeps: [stale] } as unknown as World;
        expect(idleEconomyCreeps(world, board).map(creep => creep.name)).to.deep.equal(["stale"]);
    });
});
