import { expect } from "../helpers/chai";
import { JobBoard } from "jobs/JobBoard";
import { JobKind } from "jobs/types";
import { GreedyMatcher, economyCreepsToMatch } from "matching/Matcher";
import { World } from "world/World";
import { makeCreep } from "../helpers/mock";

/**
 * Exercises the jobs + matching + memory layers together: open jobs on the
 * board, idle creeps in the world, and the greedy matcher pairing them by
 * capability + need while respecting capacity. An empty room (no collectable
 * energy) makes the harvest job genuinely needed, so flex creeps may take it.
 */
function emptyRoomWorld(creeps: Creep[]): World {
    return {
        creeps,
        getRoom: () => ({ droppedEnergy: [], energyStores: () => [] })
    } as unknown as World;
}

describe("integration: jobs + matching + memory", () => {
    it("assigns capable idle creeps to the highest-priority open jobs", () => {
        const board = new JobBoard();
        board.rehydrate();
        board.upsert({
            id: "harvest:s1",
            kind: JobKind.Harvest,
            roomName: "W1N1",
            targetId: "s1",
            capacity: 1,
            assigned: [],
            priority: 80,
            demand: { work: 2, carry: 1 }
        });
        board.upsert({
            id: "upgrade:W1N1",
            kind: JobKind.Upgrade,
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

        const world = emptyRoomWorld([a, b]);
        const matcher = new GreedyMatcher();
        matcher.assign(economyCreepsToMatch(world, board), board, world);

        // Both single-capacity jobs filled, highest priority first.
        expect([a.memory.jobId, b.memory.jobId].sort()).to.deep.equal(["harvest:s1", "upgrade:W1N1"]);
        expect(board.get("harvest:s1")?.assigned.length).to.equal(1);
        expect(board.get("upgrade:W1N1")?.assigned.length).to.equal(1);

        // Empty creeps reconsider each tick, but with both jobs full there is no
        // better-staffed option, so a second pass leaves assignments unchanged.
        const before = [a.memory.jobId, b.memory.jobId];
        matcher.assign(economyCreepsToMatch(world, board), board, world);
        expect([a.memory.jobId, b.memory.jobId]).to.deep.equal(before);
    });

    it("does not starve a low-priority job when higher jobs have spare capacity", () => {
        const board = new JobBoard();
        board.rehydrate();
        // Harvest alone could absorb every creep (capacity 3 > population 2).
        board.upsert({
            id: "harvest:s1",
            kind: JobKind.Harvest,
            roomName: "W1N1",
            targetId: "s1",
            capacity: 3,
            assigned: [],
            priority: 80,
            demand: { work: 2, carry: 1 }
        });
        board.upsert({
            id: "upgrade:W1N1",
            kind: JobKind.Upgrade,
            roomName: "W1N1",
            targetId: "c1",
            capacity: 3,
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

        const world = emptyRoomWorld([a, b]);
        new GreedyMatcher().assign(economyCreepsToMatch(world, board), board, world);

        // Least-staffed spread: harvest takes the first creep, upgrade the second.
        expect(board.get("harvest:s1")?.assigned.length).to.equal(1);
        expect(board.get("upgrade:W1N1")?.assigned.length).to.equal(1);
    });
});
