import { expect } from "../helpers/chai";
import { pickRemoteDeficit, pickRoomLabor, remoteDemand, remoteHeadroom } from "economy/EnergyModel";
import { LaborKind } from "economy/types";
import { RemotePlan } from "empire/types";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { makePos } from "../helpers/mock";

function remote(over: Partial<RemotePlan> = {}): RemotePlan {
    return {
        roomName: "W2N1",
        owner: "W1N1",
        sources: ["s1", "s2"],
        distance: 50,
        active: true,
        reserve: false,
        ...over
    };
}

function world(creeps: Creep[]): World {
    return { creepsForRoom: () => creeps } as unknown as World;
}

function bodyCreep(parts: BodyPartConstant[], targetRoom: string): Creep {
    return {
        memory: { targetRoom },
        getActiveBodyparts: (part: BodyPartConstant) => parts.filter(p => p === part).length
    } as unknown as Creep;
}

const miner5 = (): Creep => bodyCreep([WORK, WORK, WORK, WORK, WORK, MOVE], "W2N1");
const hauler = (carry: number): Creep => bodyCreep([...Array<BodyPartConstant>(carry).fill(CARRY), MOVE], "W2N1");

describe("remoteDemand", () => {
    it("targets 5 WORK per source and no haulers until a miner is producing", () => {
        const d = remoteDemand(remote(), world([]));
        expect(d.minerWork).to.deep.equal({ target: 10, supply: 0 });
        expect(d.haulerCarry.target).to.equal(0); // income 0 → no idle haulers spawned
    });

    it("sizes hauler CARRY from the actual income and the round-trip distance", () => {
        // One 5-WORK miner → income min(10, 20) = 10; carry = 10·3·50/50 = 30.
        const d = remoteDemand(remote(), world([miner5()]));
        expect(d.minerWork.supply).to.equal(5);
        expect(d.haulerCarry.target).to.equal(30);
    });

    it("counts only creeps tagged for this remote (by body shape)", () => {
        const otherRemote = bodyCreep([WORK, MOVE], "W9N9");
        const d = remoteDemand(remote(), world([miner5(), otherRemote]));
        expect(d.minerWork.supply).to.equal(5); // the W9N9 miner is not counted here
    });
});

describe("pickRemoteDeficit", () => {
    beforeEach(() => {
        Memory.empire = { remotes: { W2N1: remote() } };
    });

    it("funds a miner first while sources are unsaturated", () => {
        const pick = pickRemoteDeficit("W1N1", world([]));
        expect(pick?.kind).to.equal(LaborKind.Miner);
        expect(pick?.roomName).to.equal("W2N1");
        expect(pick?.deficit).to.equal(1); // fully unstaffed
    });

    it("funds a hauler once miners saturate the sources", () => {
        const pick = pickRemoteDeficit("W1N1", world([miner5(), miner5()]));
        expect(pick?.kind).to.equal(LaborKind.Hauler);
        expect(pick?.roomName).to.equal("W2N1");
    });

    it("returns null when the remote is fully staffed", () => {
        // 10 WORK saturates 2 sources (income 20); carry target = 20·3·50/50 = 60.
        expect(pickRemoteDeficit("W1N1", world([miner5(), miner5(), hauler(60)]))).to.equal(null);
    });

    it("ignores remotes owned by another room", () => {
        Memory.empire = { remotes: { W2N1: remote({ owner: "W9N9" }) } };
        expect(pickRemoteDeficit("W1N1", world([]))).to.equal(null);
    });
});

describe("pickRoomLabor — home-first", () => {
    function homeRoom(): WorldRoom {
        return {
            name: "W1N1",
            sources: [{ pos: makePos(10, 25) }],
            storage: { pos: makePos(25, 25) },
            spawns: [{ pos: makePos(25, 25) }],
            storageEnergy: () => 0,
            backlogEnergy: () => 0
        } as unknown as WorldRoom;
    }

    it("funds same-room mining before an unstaffed remote (no remote queue-jumping)", () => {
        Memory.empire = { remotes: { W2N1: remote() } }; // active remote owned by W1N1
        Memory.rooms = {};

        const pick = pickRoomLabor(homeRoom(), world([]));

        expect(pick?.kind).to.equal(LaborKind.Miner);
        expect(pick?.roomName).to.equal(undefined); // the HOME miner, not the remote
    });

    it("keeps funding home miners while the room is unsaturated, even with a remote assigned", () => {
        Memory.empire = { remotes: { W2N1: remote() } };
        Memory.rooms = {};
        // A worker-heavy room is NOT "covered": dedicated-miner supply is still 0, so
        // the home keeps specializing rather than diverting the slot to the remote.
        const homeWorkers = [
            bodyCreep([WORK, CARRY, MOVE], undefined as unknown as string),
            bodyCreep([WORK, CARRY, MOVE], undefined as unknown as string),
            bodyCreep([WORK, CARRY, MOVE], undefined as unknown as string)
        ];

        const pick = pickRoomLabor(homeRoom(), world(homeWorkers));

        expect(pick?.kind).to.equal(LaborKind.Miner);
        expect(pick?.roomName).to.equal(undefined); // still the HOME miner
    });
});

describe("remoteHeadroom", () => {
    it("grants population headroom per active remote", () => {
        Memory.empire = {
            remotes: {
                W2N1: remote(),
                W3N1: remote({ roomName: "W3N1" }),
                PAUSED: remote({ roomName: "PAUSED", active: false })
            }
        };
        expect(remoteHeadroom("W1N1")).to.equal(10); // 2 active × 5 (paused excluded)
    });
});
