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

/** A room that has collectable energy lying around (a dropped pile). */
function collectableRoomWorld(creeps: Creep[]): World {
    return {
        creeps,
        getRoom: () => ({ droppedEnergy: [{ amount: 50 }], energyStores: () => [] })
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

    it("fills higher-priority work to capacity before dropping to the residual upgrade sink", () => {
        const board = new JobBoard();
        board.rehydrate();
        // One harvest seat (priority 80) and the residual upgrade (priority 40).
        // The priority ladder, not load-balancing: both empty workers prefer the
        // higher-priority harvest, so it fills its one seat and only the OVERFLOW
        // creep drops to upgrade — "don't upgrade until everything else is consumed".
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

        expect(board.get("harvest:s1")?.assigned.length).to.equal(1); // seat full
        expect(board.get("upgrade:W1N1")?.assigned.length).to.equal(1); // overflow only
    });

    it("never strands a capable creep idle when only harvest work is open", () => {
        const board = new JobBoard();
        board.rehydrate();
        // Harvest has an open slot; haul + upgrade are already full. The room has
        // collectable energy, which (pre-fix) made harvest "not needed" for a
        // carrier — leaving it with NO eligible job and standing idle while a
        // perfectly good source sits open.
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
            id: "haul:W1N1",
            kind: JobKind.Haul,
            roomName: "W1N1",
            capacity: 1,
            assigned: ["hauler"],
            priority: 70,
            demand: { work: 0, carry: 4 }
        });
        board.upsert({
            id: "upgrade:W1N1",
            kind: JobKind.Upgrade,
            roomName: "W1N1",
            targetId: "c1",
            capacity: 1,
            assigned: ["upper"],
            priority: 40,
            demand: { work: 1, carry: 1 }
        });

        const flex = makeCreep({ name: "flex", body: [WORK, CARRY, MOVE], memory: { home: "W1N1" } });
        Game.creeps["flex"] = flex;
        Memory.creeps["flex"] = flex.memory;

        const world = collectableRoomWorld([flex]);
        new GreedyMatcher().assign(economyCreepsToMatch(world, board), board, world);

        // It must take the open harvest work rather than stand idle with no job.
        expect(flex.memory.jobId).to.equal("harvest:s1");
        expect(board.get("harvest:s1")?.assigned.length).to.equal(1);
    });
});
