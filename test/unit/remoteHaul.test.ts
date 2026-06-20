import { expect } from "../helpers/chai";
import { Job, JobKind } from "jobs/types";
import { LogisticsLedger } from "actions/ledger";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { makePos } from "../helpers/mock";
import { runRemoteHaul } from "actions/executors/haul";

const ledger = { reserved: () => 0, claim: () => undefined } as unknown as LogisticsLedger;

function installRoomPosition(): void {
    (global as unknown as { RoomPosition: unknown }).RoomPosition = class {
        public constructor(public x: number, public y: number, public roomName: string) {}
    };
}

function remoteHaulJob(over: Partial<Job> = {}): Job {
    return {
        id: "haul:W2N1",
        kind: JobKind.Haul,
        roomName: "W2N1",
        capacity: 4,
        assigned: [],
        priority: 70,
        demand: { work: 0, carry: 4 },
        data: { homeRoom: "W1N1" },
        pos: { x: 25, y: 25, roomName: "W2N1" },
        ...over
    } as Job;
}

interface HaulCreep {
    creep: Creep;
    moves: Array<{ roomName: string }>;
    pickups: unknown[];
    transfers: unknown[];
}

function haulCreep(opts: { room: string; working: boolean; used: number; waited?: number }): HaulCreep {
    const moves: Array<{ roomName: string }> = [];
    const pickups: unknown[] = [];
    const transfers: unknown[] = [];
    const used = opts.used;
    const creep = {
        name: "rh",
        memory: { working: opts.working, home: "W1N1", targetRoom: "W2N1", waited: opts.waited } as CreepMemory,
        store: { getUsedCapacity: () => used, getFreeCapacity: () => 100 - used, getCapacity: () => 100 },
        room: { name: opts.room },
        pos: makePos(25, 25, opts.room),
        moveTo: (target: { roomName?: string; pos?: { roomName: string } }) => {
            const roomName = target.roomName ?? target.pos?.roomName ?? "";
            moves.push({ roomName });
            return OK;
        },
        pickup: (resource: unknown) => {
            pickups.push(resource);
            return OK;
        },
        transfer: (sink: unknown) => {
            transfers.push(sink);
            return OK;
        },
        withdraw: () => OK,
        drop: () => OK
    };
    return { creep: creep as unknown as Creep, moves, pickups, transfers };
}

function worldWith(rooms: Record<string, WorldRoom>): World {
    return { getRoom: (name: string) => rooms[name] } as unknown as World;
}

describe("runRemoteHaul (cross-room haul)", () => {
    beforeEach(() => installRoomPosition());

    it("travels to the remote when gathering and not yet there", () => {
        const c = haulCreep({ room: "W1N1", working: false, used: 0 });
        runRemoteHaul(c.creep, remoteHaulJob(), worldWith({}), ledger);
        expect(c.moves).to.deep.equal([{ roomName: "W2N1" }]);
    });

    it("picks up the miner's dropped output once in the remote", () => {
        const pile = { id: "p1", amount: 500, pos: makePos(25, 25, "W2N1") } as unknown as Resource;
        const remote = { droppedEnergy: [pile], containers: [], storage: undefined } as unknown as WorldRoom;
        const c = haulCreep({ room: "W2N1", working: false, used: 0 });

        runRemoteHaul(c.creep, remoteHaulJob(), worldWith({ W2N1: remote }), ledger);

        expect(c.pickups).to.deep.equal([pile]);
    });

    it("travels home when delivering and not yet there", () => {
        const c = haulCreep({ room: "W2N1", working: true, used: 100 });
        runRemoteHaul(c.creep, remoteHaulJob(), worldWith({}), ledger);
        expect(c.moves).to.deep.equal([{ roomName: "W1N1" }]);
    });

    it("waits in the remote on a brief gap with a partial load (patience not exceeded)", () => {
        const remote = { droppedEnergy: [], containers: [], storage: undefined } as unknown as WorldRoom;
        const c = haulCreep({ room: "W2N1", working: false, used: 50, waited: 2 });

        runRemoteHaul(c.creep, remoteHaulJob(), worldWith({ W2N1: remote }), ledger);

        expect(c.creep.memory.working).to.equal(false);
        expect(c.moves).to.deep.equal([{ roomName: "W2N1" }]); // staged near the source, not heading home
    });

    it("delivers a partial load home once production has stopped (patience exceeded)", () => {
        const remote = { droppedEnergy: [], containers: [], storage: undefined } as unknown as WorldRoom;
        const c = haulCreep({ room: "W2N1", working: false, used: 50, waited: 14 });

        runRemoteHaul(c.creep, remoteHaulJob(), worldWith({ W2N1: remote }), ledger);

        expect(c.creep.memory.working).to.equal(true);
        expect(c.moves).to.deep.equal([{ roomName: "W1N1" }]); // gives up waiting, heads home partial
    });

    it("delivers to a home sink once back home", () => {
        const spawn = {
            id: "sp1",
            structureType: STRUCTURE_SPAWN,
            pos: makePos(25, 25, "W1N1"),
            store: { getFreeCapacity: () => 300, getUsedCapacity: () => 0, getCapacity: () => 300 }
        };
        const home = {
            energySinks: () => [spawn],
            storage: undefined,
            controller: undefined,
            hostiles: []
        } as unknown as WorldRoom;
        const c = haulCreep({ room: "W1N1", working: true, used: 100 });

        runRemoteHaul(c.creep, remoteHaulJob(), worldWith({ W1N1: home }), ledger);

        expect(c.transfers).to.deep.equal([spawn]);
    });
});
