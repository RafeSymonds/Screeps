import { expect } from "../helpers/chai";
import { RoomIntel } from "intel/types";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { planEmpire } from "empire/Empire";

function stubMap(exits: Record<string, string[]>): void {
    (Game as unknown as { map: unknown }).map = {
        describeExits: (room: string) => {
            const out: Record<string, string> = {};
            (exits[room] ?? []).forEach((name, i) => {
                out[String(i * 2 + 1)] = name;
            });
            return out;
        },
        getRoomLinearDistance: () => 1
    };
}

function owner(name: string, rcl = 3): WorldRoom {
    return { name, rcl } as unknown as WorldRoom;
}

function world(opts: {
    owners: WorldRoom[];
    creeps?: Creep[];
    rooms?: Record<string, WorldRoom>;
}): World {
    return {
        myRooms: opts.owners,
        creeps: opts.creeps ?? [],
        creepsForRoom: () => [],
        getRoom: (name: string) => opts.rooms?.[name]
    } as unknown as World;
}

function intel(over: Partial<RoomIntel> = {}): RoomIntel {
    return { lastSeen: Game.time, sources: [{ id: "s1", x: 10, y: 10 }], hostiles: 0, ...over };
}

function visibleRoom(hostiles: number): WorldRoom {
    return { hostiles: Array.from({ length: hostiles }, () => ({})) } as unknown as WorldRoom;
}

describe("planEmpire — threat / abandon", () => {
    it("pauses a remote when hostiles are visible in it", () => {
        stubMap({ W1N1: ["W2N1"] });
        Memory.rooms = { W2N1: { intel: intel() } };

        planEmpire(world({ owners: [owner("W1N1")], rooms: { W2N1: visibleRoom(2) } }));

        expect(Memory.empire!.remotes.W2N1.active).to.equal(false);
        expect(Memory.empire!.remotes.W2N1.reserve).to.equal(false);
    });

    it("keeps a clear remote active and reserved", () => {
        stubMap({ W1N1: ["W2N1"] });
        Memory.rooms = { W2N1: { intel: intel() } };

        planEmpire(world({ owners: [owner("W1N1")], rooms: { W2N1: visibleRoom(0) } }));

        expect(Memory.empire!.remotes.W2N1.active).to.equal(true);
        expect(Memory.empire!.remotes.W2N1.reserve).to.equal(true);
    });

    it("retreats an economy creep (clears targetRoom) when its remote is paused", () => {
        stubMap({ W1N1: ["W2N1"] });
        Memory.rooms = { W2N1: { intel: intel({ hostiles: 3 }) } };
        const miner = { memory: { home: "W1N1", targetRoom: "W2N1" } } as unknown as Creep;

        planEmpire(world({ owners: [owner("W1N1")], creeps: [miner] }));

        expect(Memory.empire!.remotes.W2N1.active).to.equal(false);
        expect(miner.memory.targetRoom).to.equal(undefined); // folds back into home economy
    });

    it("does not retreat a controller-commanded reserver", () => {
        stubMap({ W1N1: ["W2N1"] });
        Memory.rooms = { W2N1: { intel: intel({ hostiles: 3 }) } };
        const reserver = {
            memory: { home: "W1N1", targetRoom: "W2N1", controller: "remote-reserve:W2N1" }
        } as unknown as Creep;

        planEmpire(world({ owners: [owner("W1N1")], creeps: [reserver] }));

        expect(reserver.memory.targetRoom).to.equal("W2N1"); // left to expire naturally
    });
});
