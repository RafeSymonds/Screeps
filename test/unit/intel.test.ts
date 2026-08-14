import { expect } from "../helpers/chai";
import { AssignmentKind } from "shared/assignments";
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import {
    _clearReachCacheForTest,
    flagUnsafe,
    getIntel,
    INTEL_CONFIG,
    isUnsafe,
    reachableRooms,
    roomType,
    RoomType,
    run
} from "intel/index";

function g(): Record<string, any> {
    return global as unknown as Record<string, any>;
}

function fakeRoom(name: string, opts: { sources?: [number, number][]; hostiles?: any[]; owner?: string } = {}): any {
    return {
        name,
        controller: opts.owner ? { owner: { username: opts.owner }, level: 3 } : undefined,
        find: (what: number) => {
            if (what === g().FIND_SOURCES) {
                return (opts.sources ?? []).map(([x, y], i) => ({ id: `src${i}`, pos: { x, y } }));
            }
            if (what === g().FIND_HOSTILE_CREEPS) {
                return opts.hostiles ?? [];
            }
            return [];
        }
    };
}

function ctx(myRooms: string[], time = 100): TickContext {
    return {
        snapshot: {
            time,
            myRooms: myRooms.map(name => ({ name })),
            myCreeps: [],
            room: () => undefined
        },
        spawnDemands: []
    } as unknown as TickContext;
}

describe("intel", () => {
    // The exit graph is heap-cached because the map's topology never changes in a
    // live game. Tests rewrite `describeExits` between cases, which a real server
    // cannot do, so each case starts from a cold cache.
    beforeEach(() => _clearReachCacheForTest());

    it("classifies room types from name arithmetic alone", () => {
        expect(roomType("W10N3")).to.equal(RoomType.Highway);
        expect(roomType("W3N20")).to.equal(RoomType.Highway);
        expect(roomType("W15N25")).to.equal(RoomType.Center);
        expect(roomType("W14N25")).to.equal(RoomType.SourceKeeper);
        expect(roomType("W11N23")).to.equal(RoomType.Normal);
        expect(roomType("garbage")).to.equal(RoomType.Highway);
    });

    it("refreshes visible rooms with sources, ids, owner, and hostiles", () => {
        g().Game.rooms = {
            W2N1: fakeRoom("W2N1", {
                sources: [[15, 20], [35, 30]],
                hostiles: [{ body: [{ type: ATTACK }], getActiveBodyparts: () => 1 }]
            })
        };
        run(ctx([]));
        const intel = getIntel("W2N1")!;
        expect(intel.sources).to.deep.equal([20 * 50 + 15, 30 * 50 + 35]);
        expect(intel.sourceIds).to.deep.equal(["src0", "src1"]);
        expect(intel.hostiles).to.deep.include({ count: 1, armed: 1 });
        expect(intel.lastSeen).to.equal(100);
    });

    it("flags and expires unsafety, from stamps and from armed sightings", () => {
        flagUnsafe("W2N1", 300);
        expect(isUnsafe("W2N1", 299)).to.equal(true);
        expect(isUnsafe("W2N1", 301)).to.equal(false);
        g().Game.rooms = {
            W2N1: fakeRoom("W2N1", { hostiles: [{ body: [{ type: ATTACK }], getActiveBodyparts: () => 1 }] })
        };
        run(ctx([], 400));
        expect(isUnsafe("W2N1", 500)).to.equal(true); // armed sighting at 400, memory 300
        expect(isUnsafe("W2N1", 800)).to.equal(false);
    });

    it("demands one scout per home at priority 40 for the stalest eligible neighbor", () => {
        g().Game.rooms = {};
        g().Game.map.describeExits = () => ({ "1": "W1N2", "3": "W2N1", "5": "W1N0" });
        const c = ctx(["W1N1"]);
        run(c);
        expect(c.spawnDemands).to.have.length(1);
        const demand = c.spawnDemands[0];
        expect(demand.priority).to.equal(INTEL_CONFIG.scoutPriority);
        expect(demand.owner).to.equal(SubsystemId.Intel);
        expect(demand.body).to.deep.equal([MOVE]);
        expect(demand.assignment.kind).to.equal(AssignmentKind.Scout);
        // W1N0 is a highway (y%10==0) — never a scout target.
        expect((demand.assignment as { room: string }).room).to.not.equal("W1N0");
    });

    /** A 3×3 block of normal rooms, wired as a real map: exits are named whether
     *  or not the room exists, and only rooms in the block answer. */
    function installGrid(): void {
        const world = new Set<string>();
        for (let x = 1; x <= 3; x++) {
            for (let y = 1; y <= 3; y++) {
                world.add(`W${x}N${y}`);
            }
        }
        g().Game.map.describeExits = (roomName: string) => {
            const m = /^W(\d+)N(\d+)$/.exec(roomName);
            if (!m || !world.has(roomName)) {
                return null;
            }
            const x = parseInt(m[1], 10);
            const y = parseInt(m[2], 10);
            const exits: Record<string, string> = {};
            const dirs: [string, string][] = [
                ["1", `W${x}N${y - 1}`],
                ["3", `W${x - 1}N${y}`],
                ["5", `W${x}N${y + 1}`],
                ["7", `W${x + 1}N${y}`]
            ];
            for (const [dir, name] of dirs) {
                if (world.has(name)) {
                    exits[dir] = name; // a real map lists only exits that exist
                }
            }
            return exits;
        };
    }

    function seeIntel(rooms: Record<string, number>): void {
        (g().Memory as { intel?: unknown }).intel = {
            v: 1,
            rooms: Object.fromEntries(
                Object.entries(rooms).map(([name, lastSeen]) => [name, { lastSeen, sources: [] }])
            )
        };
    }

    it("scouts past the rooms next door, nearest unknown first", () => {
        // Depth 1 was never a principled limit — it was what describeExits happens
        // to answer. A two-source room two borders out is invisible to a bot that
        // only ever looks next door, and so is every expansion candidate.
        g().Game.rooms = {};
        installGrid();
        const near = ctx(["W1N1"]);
        run(near);
        expect((near.spawnDemands[0].assignment as { room: string }).room).to.equal("W1N2"); // depth 1

        // With both neighbours freshly seen, the scout keeps going rather than
        // sitting on a rotation of four rooms.
        seeIntel({ W1N2: 90, W2N1: 90 });
        const far = ctx(["W1N1"]);
        run(far);
        const target = (far.spawnDemands[0].assignment as { room: string }).room;
        expect(target).to.equal("W1N3"); // depth 2, first by name among the unseen
        expect(reachableRooms("W1N1", INTEL_CONFIG.scoutDepth).get(target)).to.equal(2);
    });

    it("prefers a room never seen to one merely stale, then takes the stalest", () => {
        g().Game.rooms = {};
        installGrid();
        // One unseen room among six stale ones: ignorance outranks staleness,
        // because an unknown room may be the next remote and a stale one is at
        // worst out of date.
        seeIntel({ W1N2: 5000, W2N1: 5000, W3N1: 5000, W2N2: 5000, W1N3: 5000, W3N2: 5000 });
        const c = ctx(["W1N1"], 20000);
        run(c);
        expect((c.spawnDemands[0].assignment as { room: string }).room).to.equal("W2N3"); // the unseen one

        // Nothing unseen left: the stalest wins, so the far ring is refreshed at
        // all rather than being starved by the near one.
        seeIntel({ W1N2: 5000, W2N1: 5000, W3N1: 5000, W2N2: 5000, W1N3: 5000, W3N2: 1, W2N3: 5000 });
        const stale = ctx(["W1N1"], 20000);
        run(stale);
        expect((stale.spawnDemands[0].assignment as { room: string }).room).to.equal("W3N2");
    });

    it("gives up on a room the scout cannot reach, instead of parking on it forever", () => {
        // "Keep walking until you arrive" is right until the answer is that you
        // cannot arrive — and then it is an infinite hold on the one scout a home
        // has. The trap is self-sustaining: an unreached room stays unseen, an
        // unseen room stays top of the list, so the scout is re-sent at the same
        // wall for the rest of its life. This is also the honest replacement for
        // asking describeExits whether a room exists (see reach.test.ts).
        g().Game.rooms = {};
        installGrid();
        const scout = {
            name: "scout1",
            memory: { owner: SubsystemId.Intel, home: "W1N1", assignment: { kind: AssignmentKind.Scout, room: "" } }
        };
        g().Game.creeps = { scout1: scout };
        const withScout = (time: number): TickContext => {
            const c = ctx(["W1N1"], time);
            (c.snapshot as unknown as { myCreeps: unknown[] }).myCreeps = [scout];
            return c;
        };

        run(ctx(["W1N1"], 100)); // no scout yet → demand names the first target
        const first = "W1N2";
        scout.memory.assignment = { kind: AssignmentKind.Scout, room: first };

        run(withScout(200)); // walk clock starts; still trying
        expect(scout.memory.assignment.room).to.equal(first);

        run(withScout(200 + INTEL_CONFIG.scoutPatience + 1));
        expect(scout.memory.assignment.room, "should have moved on").to.not.equal(first);
        // And it does not come straight back to it on the next pass.
        const second = scout.memory.assignment.room;
        run(withScout(200 + INTEL_CONFIG.scoutPatience + 2));
        expect(scout.memory.assignment.room).to.equal(second);
    });

    it("tolerates a null exits result (off the map grid)", () => {
        g().Game.map.describeExits = () => null;
        const c = ctx(["W1N1"]);
        expect(() => run(c)).to.not.throw();
        expect(c.spawnDemands).to.have.length(0);
    });
});
