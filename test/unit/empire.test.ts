import { expect } from "../helpers/chai";
import { activeRemotesFor, allRemotes, planEmpire } from "empire/Empire";
import { RoomIntel } from "intel/types";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";

type DistFn = (a: string, b: string) => number;

function stubMap(exits: Record<string, string[]>, dist: DistFn = () => 1): void {
    (Game as unknown as { map: unknown }).map = {
        describeExits: (room: string) => {
            const out: Record<string, string> = {};
            (exits[room] ?? []).forEach((name, i) => {
                out[String(i * 2 + 1)] = name;
            });
            return out;
        },
        getRoomLinearDistance: dist
    };
}

function owner(name: string, rcl = 3): WorldRoom {
    return { name, rcl } as unknown as WorldRoom;
}

function fakeWorld(owners: WorldRoom[], creeps: Record<string, Creep[]> = {}): World {
    return {
        myRooms: owners,
        creeps: [],
        creepsForRoom: (name: string) => creeps[name] ?? [],
        getRoom: () => undefined
    } as unknown as World;
}

function intel(over: Partial<RoomIntel> = {}): RoomIntel {
    return { lastSeen: Game.time, sources: [{ id: "s1", x: 10, y: 10 }], hostiles: 0, ...over };
}

function workers(n: number): Creep[] {
    return Array.from({ length: n }, () => ({ memory: {} }) as unknown as Creep);
}

describe("planEmpire — allocation", () => {
    it("assigns an adjacent unowned room with sources to the owner", () => {
        stubMap({ W1N1: ["W2N1"] });
        Memory.rooms = { W2N1: { intel: intel({ sources: [{ id: "sa", x: 5, y: 5 }] }) } };

        planEmpire(fakeWorld([owner("W1N1")]));

        const remote = Memory.empire!.remotes.W2N1;
        expect(remote).to.not.equal(undefined);
        expect(remote.owner).to.equal("W1N1");
        expect(remote.sources).to.deep.equal(["sa"]);
        expect(remote.active).to.equal(true);
        expect(activeRemotesFor("W1N1").map(r => r.roomName)).to.deep.equal(["W2N1"]);
    });

    it("skips owned, source-keeper, sourceless, and stale neighbors", () => {
        stubMap({ W1N1: ["OWNED", "SK", "EMPTY", "STALE"] });
        Memory.rooms = {
            OWNED: { intel: intel({ owner: "enemy" }) },
            SK: { intel: intel({ sourceKeeper: true }) },
            EMPTY: { intel: intel({ sources: [] }) },
            STALE: { intel: intel({ lastSeen: -100000 }) }
        };

        planEmpire(fakeWorld([owner("W1N1")]));

        expect(allRemotes()).to.deep.equal([]);
    });

    it("marks a threatened remote inactive (hostiles or invader core)", () => {
        stubMap({ W1N1: ["HOSTILE", "CORE"] });
        Memory.rooms = {
            HOSTILE: { intel: intel({ hostiles: 2 }) },
            CORE: { intel: intel({ invaderCore: true }) }
        };

        planEmpire(fakeWorld([owner("W1N1")]));

        expect(Memory.empire!.remotes.HOSTILE.active).to.equal(false);
        expect(Memory.empire!.remotes.CORE.active).to.equal(false);
        expect(activeRemotesFor("W1N1")).to.deep.equal([]);
    });

    it("does not assign remotes to a sub-RCL3 room", () => {
        stubMap({ W1N1: ["W2N1"] });
        Memory.rooms = { W2N1: { intel: intel() } };

        planEmpire(fakeWorld([owner("W1N1", 2)]));

        expect(allRemotes()).to.deep.equal([]);
    });

    it("caps each owner at its two closest remotes", () => {
        const dist: DistFn = (_a, b) => ({ A: 1, B: 2, C: 3 })[b] ?? 9;
        stubMap({ W1N1: ["A", "B", "C"] }, dist);
        Memory.rooms = {
            A: { intel: intel() },
            B: { intel: intel() },
            C: { intel: intel() }
        };

        planEmpire(fakeWorld([owner("W1N1")]));

        const kept = Object.keys(Memory.empire!.remotes).sort();
        expect(kept).to.deep.equal(["A", "B"]); // C (farthest) dropped
    });

    it("assigns a contested remote to the nearer owner", () => {
        const dist: DistFn = a => (a === "W1N1" ? 1 : 3);
        stubMap({ W1N1: ["MID"], W3N3: ["MID"] }, dist);
        Memory.rooms = { MID: { intel: intel() } };

        planEmpire(fakeWorld([owner("W1N1"), owner("W3N3")]));

        expect(Memory.empire!.remotes.MID.owner).to.equal("W1N1");
    });
});

describe("planEmpire — scout requests", () => {
    it("requests a scout for a healthy room with an unscouted neighbor", () => {
        stubMap({ W1N1: ["UNSEEN"] });
        Memory.rooms = {};

        const requests = planEmpire(fakeWorld([owner("W1N1")], { W1N1: workers(4) }));

        expect(requests).to.have.length(1);
        expect(requests[0].owner).to.equal("scout:W1N1");
        expect(requests[0].role).to.equal("scout");
    });

    it("does not request a scout when one is already alive", () => {
        stubMap({ W1N1: ["UNSEEN"] });
        Memory.rooms = {};
        const scout = { memory: { controller: "scout:W1N1" } } as unknown as Creep;

        const requests = planEmpire(fakeWorld([owner("W1N1")], { W1N1: [...workers(4), scout] }));

        expect(requests).to.deep.equal([]);
    });

    it("does not request a scout for an unhealthy (under-populated) room", () => {
        stubMap({ W1N1: ["UNSEEN"] });
        Memory.rooms = {};

        const requests = planEmpire(fakeWorld([owner("W1N1")], { W1N1: workers(2) }));

        expect(requests).to.deep.equal([]);
    });
});

describe("planEmpire — reserver requests", () => {
    function reserverOf(requests: ReturnType<typeof planEmpire>) {
        return requests.find(r => r.role === "claimer");
    }

    it("requests a reserver for an active remote with a low reservation", () => {
        stubMap({ W1N1: ["W2N1"] }); // W2N1 has fresh intel, so no scout is needed
        Memory.rooms = { W2N1: { intel: intel() } };

        const reserver = reserverOf(planEmpire(fakeWorld([owner("W1N1")], { W1N1: workers(4) })));

        expect(reserver).to.not.equal(undefined);
        expect(reserver!.owner).to.equal("remote-reserve:W2N1");
        expect(reserver!.targetRoom).to.equal("W2N1");
        expect(reserver!.roomName).to.equal("W1N1"); // spawned by the owner
    });

    it("does not request a reserver when the reservation is still high", () => {
        stubMap({ W1N1: ["W2N1"] });
        Memory.rooms = { W2N1: { intel: intel({ reservation: { username: "bot", ticks: 4000 } }) } };

        expect(reserverOf(planEmpire(fakeWorld([owner("W1N1")], { W1N1: workers(4) })))).to.equal(undefined);
    });

    it("does not reserve an invader-core remote (it is inactive)", () => {
        stubMap({ W1N1: ["W2N1"] });
        Memory.rooms = { W2N1: { intel: intel({ invaderCore: true }) } };

        expect(reserverOf(planEmpire(fakeWorld([owner("W1N1")], { W1N1: workers(4) })))).to.equal(undefined);
    });
});
