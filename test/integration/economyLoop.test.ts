import { expect } from "../helpers/chai";
import { JobBoard } from "jobs/JobBoard";
import { GreedyMatcher, idleEconomyCreeps } from "matching/Matcher";
import { World } from "world/World";
import { makeCreep } from "../helpers/mock";

/**
 * Exercises the jobs + matching + memory layers together: open jobs on the
 * board, idle creeps in the world, and the greedy matcher pairing them by
 * priority and capability while respecting capacity and stickiness.
 */
describe("integration: jobs + matching + memory", () => {
    it("assigns capable idle creeps to the highest-priority open jobs", () => {
        const board = new JobBoard();
        board.rehydrate();
        board.upsert({
            id: "harvest:s1",
            kind: "harvest",
            roomName: "W1N1",
            targetId: "s1",
            capacity: 1,
            assigned: [],
            priority: 80,
            demand: { work: 2, carry: 1 }
        });
        board.upsert({
            id: "upgrade:W1N1",
            kind: "upgrade",
            roomName: "W1N1",
            targetId: "c1",
            capacity: 1,
            assigned: [],
            priority: 40,
            demand: { work: 1, carry: 1 }
        });

        const a = makeCreep({ name: "a", body: [WORK, CARRY, MOVE], memory: { home: "W1N1" } });
        const b = makeCreep({ name: "b", body: [WORK, CARRY, MOVE], memory: { home: "W1N1" } });
        Game.creeps["a"] = a;
        Game.creeps["b"] = b;
        Memory.creeps["a"] = a.memory;
        Memory.creeps["b"] = b.memory;

        const world = { creeps: [a, b] } as unknown as World;
        const matcher = new GreedyMatcher();
        matcher.assign(idleEconomyCreeps(world, board), board, world);

        // Both single-capacity jobs filled, highest priority first.
        expect([a.memory.jobId, b.memory.jobId].sort()).to.deep.equal(["harvest:s1", "upgrade:W1N1"]);
        expect(board.get("harvest:s1")?.assigned.length).to.equal(1);
        expect(board.get("upgrade:W1N1")?.assigned.length).to.equal(1);

        // Sticky: a second pass leaves the already-assigned creeps alone.
        const stillIdle = idleEconomyCreeps(world, board);
        expect(stillIdle.length).to.equal(0);
    });
});
