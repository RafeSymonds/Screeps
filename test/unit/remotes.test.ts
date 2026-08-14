import { expect } from "../helpers/chai";
import { AssignmentKind } from "shared/assignments";
import { CreepView, RoomSnapshot } from "shared/views";
import { haulerBody, minerBody } from "economy/bodies";
import { RoomIntel } from "intel/index";
import { PRIORITY_REMOTE_BASE, PRIORITY_RESERVER, REMOTES_CONFIG } from "remotes/config";
import {
    MIN_REMOTE_CAP,
    rejectionReason,
    planAdoption,
    planRemoteDemands,
    RemoteCandidate,
    RemotePlanInput,
    remoteCrewSize,
    remoteHaulerBody,
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
    const depth = extra.depth ?? 1;
    return {
        roomName: name,
        intel: intelOf(sources),
        depth,
        travelTiles: depth * 50 + 25,
        unsafe: false,
        foreignReserved: false,
        ...extra
    };
}

function input(overrides: Partial<RemotePlanInput> = {}): RemotePlanInput {
    return {
        home: home(),
        homeCap: 1300,
        candidates: [candidate("W2N1", 2)],
        remotesAllowed: 1,
        remoteCreepsAllowed: 12,
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
            planAdoption(input({ candidates: [{ roomName: "W2N1", intel: intelOf(2, { owner: "Them" }), depth: 1, travelTiles: 75, unsafe: false, foreignReserved: false }] })).adopt
        ).to.have.length(0);
        expect(
            planAdoption(input({ candidates: [candidate("W2N1", 2, { foreignReserved: true })] })).adopt
        ).to.have.length(0);
        // OUR reservation never disqualifies our own remote (sim-caught).
        const ours = planAdoption(
            input({
                candidates: [{ roomName: "W2N1", intel: intelOf(2, { reservedBy: "bot" }), depth: 1, travelTiles: 75, unsafe: false, foreignReserved: false }],
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
        // Capability floor only — below the cost of a remote miner body we cannot
        // field one. There is no wealth policy above that any more.
        expect(planAdoption(input({ homeCap: MIN_REMOTE_CAP - 1 })).adopt).to.have.length(0);
    });

    it("names the gate that rejected a neighbour, so 'why no remotes?' is answerable", () => {
        const cfg = REMOTES_CONFIG;
        expect(rejectionReason(candidate("W2N1", 2), 1300, cfg)).to.equal(undefined); // adoptable
        expect(rejectionReason(candidate("W10N1", 2), 1300, cfg)).to.equal("highway room");
        expect(rejectionReason(candidate("W2N1", 0), 1300, cfg)).to.equal("no sources");
        expect(rejectionReason(candidate("W2N1", 2, { unsafe: true }), 1300, cfg)).to.equal("hostiles sighted");
        expect(rejectionReason(candidate("W2N1", 2, { foreignReserved: true }), 1300, cfg)).to.contain("reserved by");
        expect(rejectionReason({ ...candidate("W2N1", 2), intel: intelOf(2, { owner: "Them" }) }, 1300, cfg)).to.equal("owned by Them");
        expect(rejectionReason(candidate("W2N1", 2), 200, cfg)).to.contain("home capacity 200");
        expect(rejectionReason(candidate("W4N1", 2, { depth: 3 }), 1300, cfg)).to.equal("3 rooms out (max 2)");
    });

    it("mines two rooms out, not just next door", () => {
        // The old candidate set was describeExits — whatever happened to be
        // adjacent. A two-source room one extra border away was invisible, however
        // barren the neighbours were.
        expect(planAdoption(input({ candidates: [candidate("W3N1", 2, { depth: 2 })] })).adopt).to.deep.equal(["W3N1"]);
        expect(planAdoption(input({ candidates: [candidate("W4N1", 2, { depth: 3 })] })).adopt).to.have.length(0);
    });

    it("prices a remote in CREEPS, so distance costs more than the energy model says", () => {
        // Income is a property of the room: two sources pay the same three rooms
        // out as they do next door. What scales with distance is the fleet needed
        // to move it, because a hauler's carry requirement is its round trip — and
        // creeps, not energy, are what CPU is spent on.
        const near = remoteCrewSize(candidate("W2N1", 2, { depth: 1 }), true, 1300);
        const far = remoteCrewSize(candidate("W4N1", 2, { depth: 3 }), true, 1300);
        expect(near).to.equal(8); // 2 miners + 5 haulers + reserver
        expect(far).to.equal(15); // same income, nearly double the fleet
    });

    it("spends a crew budget rather than counting rooms", () => {
        const two = [candidate("W2N1", 2), candidate("W1N2", 2)]; // 8 creeps each
        const tight = planAdoption(input({ candidates: two, remotesAllowed: 3, remoteCreepsAllowed: 12 }));
        expect(tight.adopt).to.have.length(1);
        const roomy = planAdoption(input({ candidates: two, remotesAllowed: 3, remoteCreepsAllowed: 20 }));
        expect(roomy.adopt).to.have.length(2);
    });

    it("never lets the crew budget veto the FIRST remote", () => {
        // remotesAllowed >= 1 is the budget table already saying a remote is
        // affordable. A second, finer reading of the same share must not overrule
        // it — that produces a home that is allowed a remote and adopts none.
        const plan = planAdoption(input({ remotesAllowed: 1, remoteCreepsAllowed: 2 }));
        expect(plan.adopt).to.deep.equal(["W2N1"]);
    });

    it("drops an adopted remote that stops qualifying", () => {
        const slice: RemotesMemory = { v: 1, rooms: { W2N1: { reserved: false, adoptedAt: 1 } } };
        const plan = planAdoption(input({ slice, candidates: [candidate("W2N1", 2, { unsafe: true })] }));
        expect(plan.drop).to.deep.equal(["W2N1"]);
    });

    it("reserves 2-source remotes from the 650 floor; slack body at 1300", () => {
        expect(planAdoption(input({ homeCap: 649 })).reserve.W2N1).to.equal(false); // adopted, but below the 650 reserve floor
        const at650 = planAdoption(input({ homeCap: 650, slice: { v: 1, rooms: { W2N1: { reserved: false, adoptedAt: 1 } } } }));
        expect(at650.reserve.W2N1).to.equal(true);
        // Close enough to clear the profit bar — a ONE-source remote at range 75
        // nets 1.97 e/t against a 2.0 threshold, so it is (correctly) not worth
        // taking at all; this case is about reserving, not about adoption.
        const oneSource = planAdoption(
            input({
                candidates: [candidate("W2N1", 1, { travelTiles: 25 })],
                slice: { v: 1, rooms: { W2N1: { reserved: false, adoptedAt: 1 } } }
            })
        );
        expect(oneSource.reserve.W2N1).to.equal(false);
        expect(reserverBody(650, REMOTES_CONFIG)).to.deep.equal([CLAIM, MOVE]);
        expect(reserverBody(1300, REMOTES_CONFIG)).to.deep.equal([CLAIM, CLAIM, MOVE, MOVE]);
    });

    it("profit includes pile decay and clears the bar for a 2-source neighbor", () => {
        const near = remoteProfit(2, false, 75, 1300);
        expect(near).to.be.greaterThan(REMOTES_CONFIG.minProfit);
        // The decay term: identical setup with decay removed would differ by sources × 1.
        expect(remoteProfit(2, true, 75, 1300)).to.be.greaterThan(near);
    });

    it("uses ORDINARY miner/hauler bodies, scaled to the home cap", () => {
        // There is no such thing as a "remote miner body" any more — a remote miner
        // is a miner. The only remote-specific input is the WORK ceiling, because
        // one miner works a remote source alone and yield caps at 3 WORK unreserved
        // / 5 reserved; buying WORK past that is pure waste.
        expect(remoteMinerBody(false, 1300, 75).filter(p => p === WORK)).to.have.length(3);
        expect(remoteMinerBody(true, 1300, 75).filter(p => p === WORK)).to.have.length(5);
        // Poor home → a body it can actually afford. The old fixed body was
        // unspawnable below 1000 energy, so remotes got miners and never haulers.
        expect(remoteMinerBody(true, 300, 75).filter(p => p === WORK).length).to.be.lessThan(5);
    });

    it("buys a remote miner enough MOVE to actually GET there", () => {
        // The home ratio is 1 MOVE per 5 WORK, because a home miner walks ten tiles
        // once and then sits for 1500 ticks. Applied to a remote it is a disaster:
        // fatigue is 2 per non-MOVE part per tile against 2 cleared per MOVE per
        // tick, so [W×5,M×1] moves one tile every five ticks — 625 ticks to reach a
        // room two borders out, 42% of its life. Its haulers arrive in 125 and then
        // shuttle nothing (sim-observed: 8 haulers, 0 miners, source untouched).
        const ticksToArrive = (body: BodyPartConstant[], tiles: number): number => {
            const move = body.filter(p => p === MOVE).length;
            const nonMove = body.length - move;
            return Math.round(tiles * Math.max(1, nonMove / move));
        };
        const far = remoteMinerBody(true, 1300, 125);
        expect(ticksToArrive(far, 125)).to.be.at.most(200);
        // Nearer remotes buy less MOVE — it is priced against the trip, not fixed.
        const near = remoteMinerBody(true, 1300, 25);
        expect(near.filter(p => p === MOVE).length).to.be.lessThan(far.filter(p => p === MOVE).length);
        // And a HOME miner is untouched: no travel argument, no extra MOVE.
        expect(minerBody(1300).filter(p => p === MOVE)).to.have.length(3);
        // Haulers are right-sized to the carry actually required, not built to the
        // home's full capacity and then counted up — otherwise a rich home fields
        // oversized haulers running at a fraction of their capacity.
        const rich = remoteHaulerBody(10, 75, 1300);
        const richCarry = rich.body.filter(p => p === CARRY).length * CARRY_CAPACITY;
        expect(richCarry * rich.count).to.be.at.least(10 * (2 * 75 + 10));
        // ...and no more than one hauler's worth of slack over that requirement.
        expect((richCarry * rich.count) - 10 * (2 * 75 + 10)).to.be.lessThan(richCarry);
        // A poor home still gets something it can actually build.
        expect(remoteHaulerBody(10, 75, 300).body.length).to.be.at.most(haulerBody(300).length);
    });

    it("emits miners per source id, haulers with to:home, reserver at 90 — all in the live band", () => {
        const slice: RemotesMemory = { v: 1, rooms: { W2N1: { reserved: true, adoptedAt: 1 } } };
        // A miner ON STATION, so the hauler fleet is unlocked (see the ramp test).
        const onStation = remoteWorker(AssignmentKind.Mine, "W2N1", { sourceId: "rs0" });
        const demands = planRemoteDemands(input({ slice, roster: [onStation] }));
        const miners = demands.filter(d => d.assignment.kind === AssignmentKind.Mine);
        expect(miners.map(d => (d.assignment as { sourceId: string }).sourceId)).to.deep.equal(["rs1"]);
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

    it("ramps haulers with miners that have ARRIVED, not miners it intends to have", () => {
        // The fleet is sized for the room's theoretical rate, and that rate is zero
        // until somebody is standing on a source. Sizing off intent sent eight
        // haulers to a remote with no miner in it, where they shuttled nothing for
        // hundreds of ticks and came home with a few dozen energy each — reported
        // from the field as "8 haulers in the same remote" and "remote haulers
        // bring back a small percentage of their capacity".
        const slice: RemotesMemory = { v: 1, rooms: { W2N1: { reserved: true, adoptedAt: 1 } } };
        const haulersFor = (roster: CreepView[]): number =>
            planRemoteDemands(input({ slice, roster })).filter(d => d.assignment.kind === AssignmentKind.Haul).length;

        // Nobody there yet — including a miner still walking, which is the case
        // that produced the bug: assigned, en route, and nothing to collect.
        const walking = remoteWorker(AssignmentKind.Mine, "W2N1", { sourceId: "rs0" });
        (walking.pos as { roomName: string }).roomName = "W1N1";
        expect(haulersFor([])).to.equal(0);
        expect(haulersFor([walking])).to.equal(0);

        const onStation = remoteWorker(AssignmentKind.Mine, "W2N1", { sourceId: "rs0" });
        const half = haulersFor([onStation]);
        expect(half).to.be.greaterThan(0);
        const second = remoteWorker(AssignmentKind.Mine, "W2N1", { sourceId: "rs1" });
        expect(haulersFor([onStation, second])).to.be.greaterThan(half);
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
