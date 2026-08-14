import sinon from "sinon";
import { expect } from "../helpers/chai";
import { TickContext } from "shared/tick";
import { MOVEMENT_CONFIG as CFG } from "movement/config";
import { _clearForTest, requestMove, resolveMoves } from "movement/index";

function g(): Record<string, any> {
    return global as unknown as Record<string, any>;
}

interface FakeCreep {
    name: string;
    my: boolean;
    pos: { x: number; y: number; roomName: string };
    fatigue: number;
    move: sinon.SinonSpy;
}

function installCreep(name: string, x: number, y: number): FakeCreep {
    const creep: FakeCreep = { name, my: true, pos: { x, y, roomName: "W1N1" }, fatigue: 0, move: sinon.spy() };
    g().Game.creeps[name] = creep;
    return creep;
}

function ctx(): TickContext {
    return {
        snapshot: {
            time: g().Game.time,
            myRooms: [],
            myCreeps: [],
            room: () => ({ name: "W1N1", structures: {} } as any)
        },
        spawnDemands: []
    } as unknown as TickContext;
}

/** Straight-east path from (x,y): [(x+1,y), (x+2,y), ...]. */
function eastPath(x: number, y: number, len: number): any[] {
    return Array.from({ length: len }, (_, i) => new (g().RoomPosition)(x + 1 + i, y, "W1N1"));
}

describe("movement", () => {
    beforeEach(() => {
        _clearForTest();
    });

    it("arrival short-circuits without searching and clears the cache", () => {
        const creep = installCreep("c1", 10, 10);
        const search = sinon.spy(g().PathFinder, "search");
        requestMove("c1", { x: 11, y: 10, roomName: "W1N1" }, 1);
        resolveMoves(ctx());
        expect(search.callCount).to.equal(0);
        expect(creep.move.callCount).to.equal(0);
    });

    it("fatigue skips without stepping or stuck-counting", () => {
        const creep = installCreep("c1", 10, 10);
        creep.fatigue = 4;
        requestMove("c1", { x: 20, y: 10, roomName: "W1N1" }, 0);
        const search = sinon.spy(g().PathFinder, "search");
        resolveMoves(ctx());
        expect(search.callCount).to.equal(0);
        expect(creep.move.callCount).to.equal(0);
    });

    it("searches once, then reuses the cached path as the creep advances", () => {
        const creep = installCreep("c1", 10, 10);
        const search = sinon
            .stub(g().PathFinder, "search")
            .returns({ path: eastPath(10, 10, 5), ops: 100, cost: 5, incomplete: false });
        const to = { x: 16, y: 10, roomName: "W1N1" };

        requestMove("c1", to, 1);
        resolveMoves(ctx());
        expect(search.callCount).to.equal(1);
        expect(creep.move.firstCall.args[0]).to.equal(RIGHT);

        creep.pos = { x: 11, y: 10, roomName: "W1N1" }; // step happened
        g().Game.time = 2;
        requestMove("c1", to, 1);
        resolveMoves(ctx());
        expect(search.callCount).to.equal(1); // cache hit
        expect(creep.move.secondCall.args[0]).to.equal(RIGHT);
    });

    it("re-issues the same step when blocked, then repaths with creep stamps at stuckTicks", () => {
        const creep = installCreep("c1", 10, 10);
        installCreep("blocker", 11, 10);
        const matrices: any[] = [];
        const search = sinon.stub(g().PathFinder, "search").callsFake((_o: any, _g: any, opts: any) => {
            matrices.push(opts.roomCallback("W1N1"));
            return { path: eastPath(10, 10, 5), ops: 100, cost: 5, incomplete: false };
        });
        const to = { x: 16, y: 10, roomName: "W1N1" };

        requestMove("c1", to, 1);
        resolveMoves(ctx()); // search #1, move issued
        g().Game.time = 2;
        requestMove("c1", to, 1);
        resolveMoves(ctx()); // unmoved → re-issue same direction, stuckCount 1
        expect(search.callCount).to.equal(1);
        expect(creep.move.callCount).to.equal(2);
        expect(creep.move.secondCall.args[0]).to.equal(RIGHT);

        g().Game.time = 3;
        requestMove("c1", to, 1);
        resolveMoves(ctx()); // stuckTicks reached → repath with stamps
        expect(search.callCount).to.equal(2);
        expect(matrices[1].get(11, 10)).to.equal(255); // blocker stamped
        expect(matrices[0].get(11, 10)).to.equal(0); // original matrix untouched
    });

    it("destination change invalidates the cache", () => {
        const creep = installCreep("c1", 10, 10);
        const search = sinon
            .stub(g().PathFinder, "search")
            .returns({ path: eastPath(10, 10, 5), ops: 50, cost: 5, incomplete: false });
        requestMove("c1", { x: 16, y: 10, roomName: "W1N1" }, 1);
        resolveMoves(ctx());
        creep.pos = { x: 11, y: 10, roomName: "W1N1" };
        g().Game.time = 2;
        requestMove("c1", { x: 30, y: 30, roomName: "W1N1" }, 1);
        resolveMoves(ctx());
        expect(search.callCount).to.equal(2);
    });

    it("defers searches beyond the per-tick budget, leaving creeps intact for next tick", () => {
        const search = sinon
            .stub(g().PathFinder, "search")
            .returns({ path: eastPath(0, 0, 2), ops: CFG.maxOpsPerSearch, cost: 2, incomplete: false });
        const count = CFG.maxSearchesPerTick + 3;
        for (let i = 0; i < count; i++) {
            installCreep(`c${i}`, 0, i + 1);
            requestMove(`c${i}`, { x: 40, y: i + 1, roomName: "W1N1" }, 0);
        }
        resolveMoves(ctx());
        expect(search.callCount).to.be.at.most(CFG.maxSearchesPerTick);
    });

    it("uses incomplete paths anyway", () => {
        const creep = installCreep("c1", 10, 10);
        sinon.stub(g().PathFinder, "search").returns({ path: eastPath(10, 10, 2), ops: 600, cost: 2, incomplete: true });
        requestMove("c1", { x: 45, y: 10, roomName: "W1N1" }, 1);
        resolveMoves(ctx());
        expect(creep.move.callCount).to.equal(1);
    });

    it("drops requests and caches for dead creeps", () => {
        requestMove("ghost", { x: 5, y: 5, roomName: "W1N1" }, 0);
        expect(() => resolveMoves(ctx())).to.not.throw();
    });

    it("keeps direction steps aligned across a room border", () => {
        // Stepping ONTO an exit tile teleports the creep to the neighbor room the
        // same tick, so the (49,y)→(0,y) transition in a PathFinder path needs NO
        // direction of its own — the M5 review claimed the conversion desyncs;
        // this test pins the correct behavior: 3 moves for a 4-position crossing.
        const creep = installCreep("c1", 47, 25);
        const path = [
            new (g().RoomPosition)(48, 25, "W1N1"),
            new (g().RoomPosition)(49, 25, "W1N1"),
            new (g().RoomPosition)(0, 25, "W2N1"),
            new (g().RoomPosition)(1, 25, "W2N1")
        ];
        sinon.stub(g().PathFinder, "search").returns({ path, ops: 100, cost: 4, incomplete: false });
        requestMove("c1", { x: 5, y: 25, roomName: "W2N1" }, 1);
        resolveMoves(ctx());
        expect(creep.move.firstCall.args[0]).to.equal(RIGHT); // → (48,25)

        // Walk the cache forward: (48,25) then (49,25); the teleport lands the creep
        // at (0,25)@W2N1 and the NEXT cached step must be the one for (0)→(1): RIGHT.
        creep.pos = { x: 48, y: 25, roomName: "W1N1" };
        g().Game.time = 2;
        requestMove("c1", { x: 5, y: 25, roomName: "W2N1" }, 1);
        resolveMoves(ctx());
        expect(creep.move.secondCall.args[0]).to.equal(RIGHT); // → (49,25), teleports

        creep.pos = { x: 0, y: 25, roomName: "W2N1" };
        g().Game.time = 3;
        requestMove("c1", { x: 5, y: 25, roomName: "W2N1" }, 1);
        resolveMoves(ctx());
        expect(creep.move.thirdCall.args[0]).to.equal(RIGHT); // → (1,25) — aligned, no desync
        expect(creep.move.callCount).to.equal(3);
    });

    it("shoves an idle blocker into a swap step", () => {
        const mover = installCreep("mover", 10, 10);
        const blocker = installCreep("blocker", 11, 10);
        sinon.stub(g().PathFinder, "search").returns({ path: eastPath(10, 10, 5), ops: 100, cost: 5, incomplete: false });
        requestMove("mover", { x: 16, y: 10, roomName: "W1N1" }, 1);
        resolveMoves(ctx());
        expect(mover.move.firstCall.args[0]).to.equal(RIGHT);
        expect(blocker.move.callCount).to.equal(1);
        expect(blocker.move.firstCall.args[0]).to.equal(LEFT); // the swap: toward the mover's tile
    });

    describe("cross-room routing", () => {
        /** Capture the opts PathFinder was called with, and answer the goal. */
        function captureSearch(result: Partial<{ ops: number; incomplete: boolean; path: any[] }> = {}): {
            opts: () => any;
            all: () => any[];
            calls: () => number;
        } {
            const seen: any[] = [];
            sinon.stub(g().PathFinder, "search").callsFake((_o: any, _g: any, opts: any) => {
                seen.push(opts);
                return {
                    path: result.path ?? eastPath(10, 10, 3),
                    ops: result.ops ?? 100,
                    cost: 5,
                    incomplete: result.incomplete ?? false
                };
            });
            return { opts: () => seen[seen.length - 1], all: () => seen, calls: () => seen.length };
        }

        it("never paths through a source-keeper room", () => {
            // Their guards are permanent, respawning and lethal. The shortest line
            // from a home to a room two out will sometimes clip one, and the first
            // creep to take that shortcut dies there. The hazard is CREATED by
            // pathing further than next door: a keeper block needs both room
            // coordinates in 4-6, unreachable at depth 1 and reachable at depth 2.
            installCreep("c1", 10, 10);
            const search = captureSearch();
            requestMove("c1", { x: 25, y: 25, roomName: "W3N1" }, 20);
            resolveMoves(ctx());
            const cb = search.opts().roomCallback;
            expect(cb("W14N14")).to.equal(false); // source keeper
            expect(cb("W3N1")).to.not.equal(false);
            expect(cb("W1N2")).to.not.equal(false); // an ordinary detour stays open
        });

        it("still lets a creep walk OUT of a keeper room it somehow ended up in", () => {
            const creep = installCreep("c1", 10, 10);
            creep.pos.roomName = "W14N14";
            const search = captureSearch();
            requestMove("c1", { x: 25, y: 25, roomName: "W13N14" }, 20);
            resolveMoves(ctx());
            expect(search.opts().roomCallback("W14N14")).to.not.equal(false);
        });

        it("holds cross-room searches to the same ops cap as in-room ones", () => {
            // Raising it for cross-room goals only is the obvious repair — 600 ops
            // buys a fraction of a 125-tile path — and it broke the raid-early
            // gate: one 2000-op search takes half the shared 4000-op pool, so
            // every creep resolved after it stands, including the defender walking
            // at an attacker. See movement/config.ts.
            installCreep("far", 10, 10);
            installCreep("near", 12, 12);
            const search = captureSearch();
            requestMove("far", { x: 25, y: 25, roomName: "W3N1" }, 20);
            requestMove("near", { x: 40, y: 10, roomName: "W1N1" }, 1);
            resolveMoves(ctx());

            const [cross, inRoom] = search.all();
            expect(cross.maxOps).to.equal(CFG.maxOpsPerSearch);
            expect(cross.maxRooms).to.equal(16);
            // Same-room goals stay pinned to one room: without it PathFinder will
            // route out through a neighbour and back.
            expect(inRoom.maxOps).to.equal(CFG.maxOpsPerSearch);
            expect(inRoom.maxRooms).to.equal(1);
        });
    });

    it("never shoves a creep with its own plans, on fatigue, or on a container seat", () => {
        installCreep("mover", 10, 10);
        const busy = installCreep("busy", 11, 10);
        sinon.stub(g().PathFinder, "search").returns({ path: eastPath(10, 10, 5), ops: 100, cost: 5, incomplete: false });
        requestMove("mover", { x: 16, y: 10, roomName: "W1N1" }, 1);
        requestMove("busy", { x: 11, y: 20, roomName: "W1N1" }, 0); // it has a move of its own
        resolveMoves(ctx());
        // busy moved for its own request (same stubbed path shape), never as a shove:
        // its single move came from its own resolution, not a LEFT swap.
        expect(busy.move.callCount).to.equal(1);
        expect(busy.move.firstCall.args[0]).to.not.equal(LEFT);

        _clearForTest();
        const seat = installCreep("seat", 11, 10);
        seat.move.resetHistory();
        g().Game.creeps = { mover: installCreep("mover", 10, 10), seat };
        const seatCtx = ctx();
        (seatCtx.snapshot as unknown as { room: () => unknown }).room = () =>
            ({
                name: "W1N1",
                structures: {
                    [g().STRUCTURE_CONTAINER]: [{ pos: { x: 11, y: 10, roomName: "W1N1" } }]
                }
            }) as unknown;
        requestMove("mover", { x: 16, y: 10, roomName: "W1N1" }, 1);
        resolveMoves(seatCtx);
        expect(seat.move.callCount).to.equal(0); // a miner's seat is never vacated
    });
});
