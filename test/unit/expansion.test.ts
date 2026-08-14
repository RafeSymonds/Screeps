import { expect } from "../helpers/chai";
import { AssignmentKind } from "shared/assignments";
import { CreepView } from "shared/views";
import { RoomIntel } from "intel/index";
import { EXPANSION_CONFIG, PRIORITY_CLAIMER, PRIORITY_PIONEER } from "expansion/config";
import {
    ClaimPhase,
    ExpansionDecisionInput,
    ExpansionMemory,
    planExpansionDecision,
    planExpansionDemands
} from "expansion/plan";
import { ExpansionCandidate, scoreCandidate } from "expansion/score";

function intelOf(sources: number, extra: Partial<RoomIntel> = {}): RoomIntel {
    return {
        lastSeen: 100,
        sources: Array.from({ length: sources }, (_, i) => 1000 + i),
        sourceIds: Array.from({ length: sources }, (_, i) => `s${i}`),
        ...extra
    };
}

function candidate(name: string, sources: number, extra: Partial<ExpansionCandidate> = {}): ExpansionCandidate {
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

function creep(kind: AssignmentKind, room: string, name = `c-${kind}-${room}`): CreepView {
    return {
        name,
        id: "x" as Id<Creep>,
        pos: { x: 25, y: 25, roomName: room },
        hits: 100,
        hitsMax: 100,
        ticksToLive: 500,
        spawning: false,
        bodyCounts: {},
        store: { free: 0, used: 0, byResource: {} },
        memory: { owner: "expansion", assignment: { kind, room } } as unknown as CreepMemory
    };
}

function input(overrides: Partial<ExpansionDecisionInput> = {}): ExpansionDecisionInput {
    return {
        slice: { v: 1 },
        wanted: true,
        candidates: [candidate("W2N1", 2)],
        ownedMinerals: [],
        sponsors: [{ name: "W1N1", cap: 1300 }],
        roster: [],
        targetMine: false,
        targetHasSpawn: false,
        time: 1000,
        config: EXPANSION_CONFIG,
        ...overrides
    };
}

const claiming = (extra: Record<string, unknown> = {}): ExpansionMemory => ({
    v: 1,
    claim: { target: "W2N1", sponsor: "W1N1", phase: ClaimPhase.Claiming, startedAt: 100, claimerDeaths: 0, ...extra }
});

describe("expansion scoring", () => {
    it("ranks by sources, then novel mineral", () => {
        const two = scoreCandidate(candidate("W2N1", 2), []);
        const one = scoreCandidate(candidate("W1N2", 1), []);
        expect(two).to.be.greaterThan(one);
        const withMineral = scoreCandidate(
            { ...candidate("W2N1", 1), intel: intelOf(1, { mineral: { type: RESOURCE_UTRIUM, pos: 100 } }) },
            []
        );
        expect(withMineral).to.be.greaterThan(one);
        // A mineral we already own is worth nothing.
        const owned = scoreCandidate(
            { ...candidate("W2N1", 1), intel: intelOf(1, { mineral: { type: RESOURCE_UTRIUM, pos: 100 } }) },
            [RESOURCE_UTRIUM]
        );
        expect(owned).to.equal(one);
    });
});

describe("expansion state machine", () => {
    it("starts a claim only when empire wants it, off cooldown, with a fundable sponsor", () => {
        expect(planExpansionDecision(input()).start).to.deep.equal({ target: "W2N1", sponsor: "W1N1" });
        expect(planExpansionDecision(input({ wanted: false })).start).to.equal(undefined);
        expect(planExpansionDecision(input({ slice: { v: 1, cooldownUntil: 5000 } })).start).to.equal(undefined);
        // A 650-energy claimer at an RCL2 sponsor would park its whole queue.
        expect(planExpansionDecision(input({ sponsors: [{ name: "W1N1", cap: 550 }] })).start).to.equal(undefined);
        expect(planExpansionDecision(input({ candidates: [] })).start).to.equal(undefined);
    });

    it("advances to pioneering on OBSERVED ownership", () => {
        expect(planExpansionDecision(input({ slice: claiming(), targetMine: true })).advance).to.equal(ClaimPhase.Pioneering);
        expect(planExpansionDecision(input({ slice: claiming() })).advance).to.equal(undefined);
    });

    it("counts claimer deaths from the slice's recorded name, aborting past the limit", () => {
        const withClaimer = claiming({ claimerName: "claim_W1N1_1" });
        // Name recorded but absent from the roster → it died (memory is GC'd the
        // tick after death, so the slice is the only durable evidence).
        expect(planExpansionDecision(input({ slice: withClaimer })).claimerDied).to.equal(true);
        // Still alive → no death.
        expect(
            planExpansionDecision(input({ slice: withClaimer, roster: [creep(AssignmentKind.Claim, "W2N1", "claim_W1N1_1")] })).claimerDied
        ).to.equal(undefined);
        const atLimit = claiming({ claimerName: "gone", claimerDeaths: EXPANSION_CONFIG.claimerDeathLimit });
        expect(planExpansionDecision(input({ slice: atLimit })).abort).to.equal("claimer-deaths");
    });

    it("aborts when the target stops qualifying", () => {
        const decision = planExpansionDecision(input({ slice: claiming(), candidates: [candidate("W2N1", 2, { unsafe: true })] }));
        expect(decision.abort).to.equal("target-ineligible");
    });

    it("re-picks a sponsor that is gone (not merely crippled) and holds when none exists", () => {
        const gone = planExpansionDecision(input({ slice: claiming(), sponsors: [{ name: "W3N3", cap: 1300 }] }));
        expect(gone.sponsorRepick).to.equal("W3N3");
        const none = planExpansionDecision(input({ slice: claiming(), sponsors: [] }));
        expect(none.sponsorRepick).to.equal(undefined);
        expect(none.abort).to.equal(undefined); // hold, never silently abandon
    });

    it("finishes on the target's own spawn, and warns before the downgrade cliff", () => {
        const pioneering: ExpansionMemory = {
            v: 1,
            claim: { target: "W2N1", sponsor: "W1N1", phase: ClaimPhase.Pioneering, startedAt: 100, claimerDeaths: 0 }
        };
        expect(planExpansionDecision(input({ slice: pioneering, targetHasSpawn: true })).done).to.equal(true);
        // pioneerTimeout must fire well before CONTROLLER_DOWNGRADE[1] = 20000,
        // which UNCLAIMS the room rather than merely downgrading it.
        expect(EXPANSION_CONFIG.pioneerTimeout).to.be.lessThan(20000);
        const late = planExpansionDecision(input({ slice: pioneering, time: 100 + EXPANSION_CONFIG.pioneerTimeout + 1 }));
        expect(late.timedOut).to.equal(true);
        expect(late.done).to.equal(undefined); // alert, but never abandon
    });
});

describe("expansion demands", () => {
    it("demands one claimer in the live band, then pioneers", () => {
        const claimDemands = planExpansionDemands(claiming(), 1300, []);
        expect(claimDemands).to.have.length(1);
        expect(claimDemands[0].priority).to.equal(PRIORITY_CLAIMER);
        expect(claimDemands[0].body).to.deep.equal([CLAIM, MOVE]);
        expect(claimDemands[0].home).to.equal("W1N1");
        expect(claimDemands[0].priority).to.be.lessThan(100); // never behind upgraders

        // A live claimer means no second demand.
        expect(planExpansionDemands(claiming(), 1300, [creep(AssignmentKind.Claim, "W2N1")])).to.have.length(0);
    });

    it("demands the pioneer crew and counts the staffed ones", () => {
        const pioneering: ExpansionMemory = {
            v: 1,
            claim: { target: "W2N1", sponsor: "W1N1", phase: ClaimPhase.Pioneering, startedAt: 100, claimerDeaths: 0 }
        };
        const demands = planExpansionDemands(pioneering, 1300, []);
        expect(demands).to.have.length(EXPANSION_CONFIG.pioneers);
        expect(demands[0].priority).to.equal(PRIORITY_PIONEER);
        expect(demands[0].assignment.kind).to.equal(AssignmentKind.Work);
        const staffed = planExpansionDemands(pioneering, 1300, [creep(AssignmentKind.Work, "W2N1")]);
        expect(staffed).to.have.length(EXPANSION_CONFIG.pioneers - 1);
    });

    it("emits nothing without a claim or from an unfundable sponsor", () => {
        expect(planExpansionDemands({ v: 1 }, 1300, [])).to.have.length(0);
        expect(planExpansionDemands(claiming(), 550, [])).to.have.length(0);
    });
});
