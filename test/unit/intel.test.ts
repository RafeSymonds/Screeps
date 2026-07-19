import { expect } from "../helpers/chai";
import { describeExits } from "intel/adjacency";
import { recordRoomIntel } from "intel/Scouting";
import { stalestNeighbor } from "intel/scout";
import { WorldRoom } from "world/WorldRoom";

interface MapStub {
    describeExits?: Record<string, string | undefined>;
    linear?: number;
}

function stubMap(stub: MapStub): void {
    (Game as unknown as { map: unknown }).map = {
        describeExits: () => stub.describeExits ?? {},
        getRoomLinearDistance: () => stub.linear ?? 1
    };
}

/** A minimal WorldRoom for recordRoomIntel: sources + controller + a find() stub. */
function fakeRemote(opts: {
    name?: string;
    sources?: Array<{ id: string; x: number; y: number }>;
    controller?: Partial<StructureController>;
    hostiles?: number;
    hostileStructures?: Array<{ structureType: string }>;
    structures?: Array<{ structureType: string }>;
}): WorldRoom {
    const sources = (opts.sources ?? []).map(s => ({ id: s.id, pos: { x: s.x, y: s.y } }));
    const room = {
        find: (type: number) => {
            if (type === FIND_HOSTILE_STRUCTURES) {
                return opts.hostileStructures ?? [];
            }
            return opts.structures ?? [];
        }
    };
    return {
        name: opts.name ?? "W2N1",
        room,
        controller: opts.controller,
        sources,
        hostiles: Array.from({ length: opts.hostiles ?? 0 }, () => ({}))
    } as unknown as WorldRoom;
}

describe("describeExits", () => {
    it("returns the defined neighbor room names, dropping empty exits", () => {
        stubMap({ describeExits: { "1": "W1N2", "3": "W0N1", "5": undefined, "7": "W2N1" } });
        expect(describeExits("W1N1").sort()).to.deep.equal(["W0N1", "W1N2", "W2N1"]);
    });

    it("returns [] for a room with no exits recorded", () => {
        stubMap({ describeExits: {} });
        expect(describeExits("W1N1")).to.deep.equal([]);
    });
});

describe("recordRoomIntel", () => {
    it("captures source ids + positions and controller reservation", () => {
        Memory.rooms = {};
        (Game as { time: number }).time = 500;
        recordRoomIntel(
            fakeRemote({
                name: "W2N1",
                sources: [
                    { id: "s1", x: 10, y: 20 },
                    { id: "s2", x: 40, y: 30 }
                ],
                controller: {
                    id: "c1" as Id<StructureController>,
                    level: 0,
                    reservation: { username: "bot", ticksToEnd: 3000 }
                } as Partial<StructureController>
            })
        );
        const intel = Memory.rooms.W2N1.intel!;
        expect(intel.lastSeen).to.equal(500);
        expect(intel.sources).to.deep.equal([
            { id: "s1", x: 10, y: 20 },
            { id: "s2", x: 40, y: 30 }
        ]);
        expect(intel.controllerId).to.equal("c1");
        expect(intel.reservation).to.deep.equal({ username: "bot", ticks: 3000 });
        expect(intel.invaderCore).to.equal(undefined);
        expect(intel.sourceKeeper).to.equal(undefined);
    });

    it("flags invader cores and source keeper lairs", () => {
        Memory.rooms = {};
        recordRoomIntel(
            fakeRemote({
                name: "W3N1",
                hostileStructures: [{ structureType: STRUCTURE_INVADER_CORE }],
                structures: [{ structureType: STRUCTURE_KEEPER_LAIR }]
            })
        );
        const intel = Memory.rooms.W3N1.intel!;
        expect(intel.invaderCore).to.equal(true);
        expect(intel.sourceKeeper).to.equal(true);
    });
});

describe("stalestNeighbor", () => {
    it("prefers a never-seen neighbor over a seen one", () => {
        stubMap({ describeExits: { "1": "SEEN", "3": "UNSEEN" } });
        Memory.rooms = { SEEN: { intel: { lastSeen: 100, sources: [], hostiles: 0 } } };
        expect(stalestNeighbor("W1N1")).to.equal("UNSEEN");
    });

    it("picks the oldest-seen neighbor when all have intel", () => {
        stubMap({ describeExits: { "1": "OLD", "3": "NEW" } });
        Memory.rooms = {
            OLD: { intel: { lastSeen: 100, sources: [], hostiles: 0 } },
            NEW: { intel: { lastSeen: 900, sources: [], hostiles: 0 } }
        };
        expect(stalestNeighbor("W1N1")).to.equal("OLD");
    });

    it("skips known-dangerous neighbors (owned / source keeper) on the sweep", () => {
        // OWNED and SK are the stalest, but a MOVE-only scout dies in both; the
        // sweep must rotate through the safe neighbor instead (the death loop fix).
        (Game as { time: number }).time = 10000;
        stubMap({ describeExits: { "1": "OWNED", "3": "SK", "5": "SAFE" } });
        Memory.rooms = {
            OWNED: { intel: { lastSeen: 100, sources: [], hostiles: 0, owner: "enemy" } },
            SK: { intel: { lastSeen: 200, sources: [], hostiles: 0, sourceKeeper: true } },
            SAFE: { intel: { lastSeen: 9000, sources: [], hostiles: 0 } }
        };
        expect(stalestNeighbor("W1N1")).to.equal("SAFE");
    });

    it("re-checks a dangerous neighbor once its long danger window elapses", () => {
        (Game as { time: number }).time = 100000;
        stubMap({ describeExits: { "1": "OWNED", "3": "SAFE" } });
        Memory.rooms = {
            // 40000 ticks stale — past SCOUT_STALE_TICKS * SCOUT_DANGER_STALE_MULT.
            OWNED: { intel: { lastSeen: 60000, sources: [], hostiles: 0, owner: "enemy" } },
            SAFE: { intel: { lastSeen: 99000, sources: [], hostiles: 0 } }
        };
        expect(stalestNeighbor("W1N1")).to.equal("OWNED");
    });

    it("still sweeps rooms with mere hostile creeps (invaders expire; remotes need re-verifying)", () => {
        (Game as { time: number }).time = 10000;
        stubMap({ describeExits: { "1": "HOSTILE", "3": "SAFE" } });
        Memory.rooms = {
            HOSTILE: { intel: { lastSeen: 100, sources: [], hostiles: 3 } },
            SAFE: { intel: { lastSeen: 9000, sources: [], hostiles: 0 } }
        };
        expect(stalestNeighbor("W1N1")).to.equal("HOSTILE");
    });
});
