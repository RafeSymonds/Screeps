import { expect } from "../helpers/chai";
import { AssignmentKind } from "shared/assignments";
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { flagUnsafe, getIntel, INTEL_CONFIG, isUnsafe, roomType, RoomType, run } from "intel/index";

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

    it("tolerates a null exits result (off the map grid)", () => {
        g().Game.map.describeExits = () => null;
        const c = ctx(["W1N1"]);
        expect(() => run(c)).to.not.throw();
        expect(c.spawnDemands).to.have.length(0);
    });
});
