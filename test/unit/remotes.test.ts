import { expect } from "../helpers/chai";
import { AssignmentKind } from "shared/assignments";
import { CreepView, RoomSnapshot } from "shared/views";
import { RoomIntel } from "intel/index";
import { PRIORITY_REMOTE_BASE, PRIORITY_RESERVER, REMOTES_CONFIG } from "remotes/config";
import {
    rejectionReason,
    planAdoption,
    planRemoteDemands,
    RemoteCandidate,
    RemotePlanInput,
    remoteMinerBody,
    remoteProfit,
    RemotesMemory,
    reserverBody
} from "remotes/planner";

function home(cap = 1300): RoomSnapshot {
    return {
        name: "W1N1",
        my: true,
        energyAvailable: cap,
        energyCapacityAvailable: cap,
        sources: [{ id: "h1" as Id<Source>, pos: { x: 10, y: 40, roomName: "W1N1" }, energy: 3000, energyCapacity: 3000 }],
        structures: {},
        myConstructionSites: [],
        hostiles: [],
        dropped: []
    } as unknown as RoomSnapshot;
}

function intelOf(sources: number, extra: Partial<RoomIntel> = {}): RoomIntel {
    return {
        lastSeen: 100,
        sources: Array.from({ length: sources }, (_, i) => 1000 + i),
        sourceIds: Array.from({ length: sources }, (_, i) => `rs${i}`),
        ...extra
    };
}

function candidate(name: string, sources: number, extra: Partial<RemoteCandidate> = {}): RemoteCandidate {
    return { roomName: name, intel: intelOf(sources), travelTiles: 75, unsafe: false, foreignReserved: false, ...extra };
}

function input(overrides: Partial<RemotePlanInput> = {}): RemotePlanInput {
    return {
        home: home(),
        homeCap: 1300,
        candidates: [candidate("W2N1", 2)],
        remotesAllowed: 1,
        slice: { v: 1, rooms: {} } as RemotesMemory,
        roster: [],
        homeHealthy: true,
        health: { miners: 2, minersNeeded: 2, haulers: 2, haulersNeeded: 2 },
        time: 500,
        config: REMOTES_CONFIG,
        ...overrides
    };
}

function remoteWorker(kind: AssignmentKind, room: string, extra: Record<string, unknown> = {}): CreepView {
    return {
        name: `r-${kind}-${Math.random()}`,
        id: "x" as Id<Creep>,
        pos: { x: 25, y: 25, roomName: room },
        hits: 100,
        hitsMax: 100,
        ticksToLive: 1000,
        spawning: false,
        bodyCounts: {},
        store: { free: 0, used: 0, byResource: {} },
        memory: { home: "W1N1", owner: "remotes", assignment: { kind, room, ...extra } } as unknown as CreepMemory
    };
}

describe("remotes planner", () => {
    it("adopts the profitable neighbor, capped at the CPU allowance", () => {
        const twoCands = input({ candidates: [candidate("W2N1", 2), candidate("W1N2", 2)] });
        const plan = planAdoption(twoCands);
        expect(plan.adopt).to.have.length(1); // fixture's remotesAllowed
    });

    it("rejects hostile, owned, foreign-reserved, highway, and unsafe rooms", () => {
        expect(planAdoption(input({ candidates: [candidate("W2N1", 2, { unsafe: true })] })).adopt).to.have.length(0);
        expect(
            planAdoption(input({ candidates: [{ roomName: "W2N1", intel: intelOf(2, { owner: "Them" }), travelTiles: 75, unsafe: false, foreignReserved: false }] })).adopt
        ).to.have.length(0);
        expect(
            planAdoption(input({ candidates: [candidate("W2N1", 2, { foreignReserved: true })] })).adopt
        ).to.have.length(0);
        // OUR reservation never disqualifies our own remote (sim-caught).
        const ours = planAdoption(
            input({
                candidates: [{ roomName: "W2N1", intel: intelOf(2, { reservedBy: "bot" }), travelTiles: 75, unsafe: false, foreignReserved: false }],
                slice: { v: 1, rooms: { W2N1: { reserved: true, adoptedAt: 1 } } }
            })
        );
        expect(ours.drop).to.have.length(0);
        expect(planAdoption(input({ candidates: [candidate("W10N1", 2)] })).adopt).to.have.length(0); // highway
    });

    it("adopts a scouted neighbour that has sources — the gates in one place", () => {
        // The four things that stop adoption, so a "why are there no remotes?"
        // question has one place to look: room type, ownership/reservation,
        // safety, and — the usual answer in a seeded sim world — no sources.
        expect(planAdoption(input()).adopt).to.deep.equal(["W2N1"]);
        expect(planAdoption(input({ candidates: [candidate("W2N1", 0)] })).adopt).to.have.length(0);
        expect(planAdoption(input({ homeCap: REMOTES_CONFIG.minHomeCap - 1 })).adopt).to.have.length(0);
    });

    it("names the gate that rejected a neighbour, so 'why no remotes?' is answerable", () => {
        const cfg = REMOTES_CONFIG;
        expect(rejectionReason(candidate("W2N1", 2), 1300, cfg)).to.equal(undefined); // adoptable
        expect(rejectionReason(candidate("W10N1", 2), 1300, cfg)).to.equal("highway room");
        expect(rejectionReason(candidate("W2N1", 0), 1300, cfg)).to.equal("no sources");
        expect(rejectionReason(candidate("W2N1", 2, { unsafe: true }), 1300, cfg)).to.equal("hostiles sighted");
        expect(rejectionReason(candidate("W2N1", 2, { foreignReserved: true }), 1300, cfg)).to.contain("reserved by");
        expect(rejectionReason({ ...candidate("W2N1", 2), intel: intelOf(2, { owner: "Them" }) }, 1300, cfg)).to.equal("owned by Them");
        expect(rejectionReason(candidate("W2N1", 2), 300, cfg)).to.contain("home capacity 300");
    });

    it("drops an adopted remote that stops qualifying", () => {
        const slice: RemotesMemory = { v: 1, rooms: { W2N1: { reserved: false, adoptedAt: 1 } } };
        const plan = planAdoption(input({ slice, candidates: [candidate("W2N1", 2, { unsafe: true })] }));
        expect(plan.drop).to.deep.equal(["W2N1"]);
    });

    it("reserves 2-source remotes from the 650 floor; slack body at 1300", () => {
        expect(planAdoption(input({ homeCap: 649 })).reserve.W2N1).to.equal(false); // adopted (≥550) but below the 650 reserve floor
        const at650 = planAdoption(input({ homeCap: 650, slice: { v: 1, rooms: { W2N1: { reserved: false, adoptedAt: 1 } } } }));
        expect(at650.reserve.W2N1).to.equal(true);
        const oneSource = planAdoption(
            input({ candidates: [candidate("W2N1", 1)], slice: { v: 1, rooms: { W2N1: { reserved: false, adoptedAt: 1 } } } })
        );
        expect(oneSource.reserve.W2N1).to.equal(false);
        expect(reserverBody(650, REMOTES_CONFIG)).to.deep.equal([CLAIM, MOVE]);
        expect(reserverBody(1300, REMOTES_CONFIG)).to.deep.equal([CLAIM, CLAIM, MOVE, MOVE]);
    });

    it("profit includes pile decay and clears the bar for a 2-source neighbor", () => {
        const near = remoteProfit(2, false, 75);
        expect(near).to.be.greaterThan(REMOTES_CONFIG.minProfit);
        // The decay term: identical setup with decay removed would differ by sources × 1.
        expect(remoteProfit(2, true, 75)).to.be.greaterThan(near);
    });

    it("sizes remote bodies for the remote, not the home cap", () => {
        expect(remoteMinerBody(false).filter(p => p === WORK)).to.have.length(3);
        expect(remoteMinerBody(true).filter(p => p === WORK)).to.have.length(5);
        // Full speed: MOVE covers (WORK+CARRY+1)/2.
        expect(remoteMinerBody(true).filter(p => p === MOVE)).to.have.length(3);
    });

    it("emits miners per source id, haulers with to:home, reserver at 90 — all in the live band", () => {
        const slice: RemotesMemory = { v: 1, rooms: { W2N1: { reserved: true, adoptedAt: 1 } } };
        const demands = planRemoteDemands(input({ slice }));
        const miners = demands.filter(d => d.assignment.kind === AssignmentKind.Mine);
        expect(miners.map(d => (d.assignment as { sourceId: string }).sourceId)).to.deep.equal(["rs0", "rs1"]);
        const haulers = demands.filter(d => d.assignment.kind === AssignmentKind.Haul);
        expect(haulers.length).to.be.at.least(1);
        expect((haulers[0].assignment as { to?: string }).to).to.equal("W1N1");
        const reserver = demands.find(d => d.assignment.kind === AssignmentKind.Reserve)!;
        expect(reserver.priority).to.equal(PRIORITY_RESERVER);
        for (const d of demands) {
            expect(d.priority, d.id).to.be.at.least(PRIORITY_REMOTE_BASE);
            expect(d.priority, d.id).to.be.lessThan(100); // never behind home upgraders
        }
    });

    it("suppresses demands when the home is unhealthy or the remote unsafe", () => {
        const slice: RemotesMemory = { v: 1, rooms: { W2N1: { reserved: false, adoptedAt: 1 } } };
        expect(planRemoteDemands(input({ slice, homeHealthy: false }))).to.have.length(0);
        expect(planRemoteDemands(input({ slice, candidates: [candidate("W2N1", 2, { unsafe: true })] }))).to.have.length(0);
    });

    it("counts staffed remote creeps against the gaps", () => {
        const slice: RemotesMemory = { v: 1, rooms: { W2N1: { reserved: false, adoptedAt: 1 } } };
        const roster = [
            remoteWorker(AssignmentKind.Mine, "W2N1", { sourceId: "rs0" }),
            remoteWorker(AssignmentKind.Mine, "W2N1", { sourceId: "rs1" })
        ];
        const demands = planRemoteDemands(input({ slice, roster }));
        expect(demands.filter(d => d.assignment.kind === AssignmentKind.Mine)).to.have.length(0);
    });
});
