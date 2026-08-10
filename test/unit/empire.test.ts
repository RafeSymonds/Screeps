import { expect } from "../helpers/chai";
import { AssignmentKind } from "shared/assignments";
import { SpawnDemand } from "shared/spawning";
import { SubsystemId } from "shared/subsystems";
import { RoomSnapshot } from "shared/views";
import { brokerAid, planAidRoutes } from "empire/aid";
import { EMPIRE_CONFIG } from "empire/config";
import { classify, RoomLifecycle } from "empire/registry";

function room(name: string, overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
    return {
        name,
        my: true,
        controller: {
            id: "c" as Id<StructureController>,
            pos: { x: 25, y: 25, roomName: name },
            level: 4,
            my: true,
            progress: 0,
            progressTotal: 100,
            ticksToDowngrade: 20000,
            safeModeAvailable: 1
        },
        energyAvailable: 1300,
        energyCapacityAvailable: 1300,
        sources: [],
        structures: {
            [STRUCTURE_SPAWN]: [
                {
                    id: "s1" as Id<AnyStructure>,
                    type: STRUCTURE_SPAWN,
                    pos: { x: 25, y: 25, roomName: name },
                    hits: 5000,
                    hitsMax: 5000,
                    spawning: false
                }
            ]
        },
        myConstructionSites: [],
        hostiles: [],
        dropped: [],
        ...overrides
    } as RoomSnapshot;
}

const spawnless = (name: string): RoomSnapshot => room(name, { structures: {} });

function demand(home: string, priority: number, id = `d-${home}-${priority}`): SpawnDemand {
    return {
        id,
        priority,
        home,
        owner: SubsystemId.Economy,
        assignment: { kind: AssignmentKind.Upgrade, room: home },
        body: [WORK, CARRY, MOVE]
    };
}

describe("empire registry", () => {
    it("classifies a fresh claim as Bootstrapping, not Crippled — the ORDER is the spec", () => {
        // A just-claimed room matches BOTH spawnless rules; expansion's target wins.
        expect(classify(spawnless("W2N1"), 0, "W2N1")).to.equal(RoomLifecycle.Bootstrapping);
        expect(classify(spawnless("W2N1"), 0, undefined)).to.equal(RoomLifecycle.Crippled);
    });

    it("keeps a healthy room Stable through a generation gap", () => {
        // Zero creeps for a couple of ticks mid-turnover, but spawn-side is FULL —
        // the energy conjunct is what stops the misclassification.
        expect(classify(room("W1N1"), 0, undefined)).to.equal(RoomLifecycle.Stable);
        expect(classify(room("W1N1", { energyAvailable: 100 }), 0, undefined)).to.equal(RoomLifecycle.Crippled);
        expect(classify(room("W1N1"), 12, undefined)).to.equal(RoomLifecycle.Stable);
    });

    it("classifies a young room as Bootstrapping", () => {
        const young = room("W1N1");
        young.controller!.level = 1;
        expect(classify(young, 2, undefined)).to.equal(RoomLifecycle.Bootstrapping);
        expect(classify(young, 8, undefined)).to.equal(RoomLifecycle.Stable);
    });
});

describe("empire aid", () => {
    const distance = (a: string, b: string): number => (a === b ? 0 : a[1] === b[1] ? 1 : 3);

    it("routes a crippled room to the nearest Stable donor in range", () => {
        const routes = planAidRoutes(
            { W1N1: RoomLifecycle.Crippled, W1N2: RoomLifecycle.Stable, W9N9: RoomLifecycle.Stable },
            distance,
            EMPIRE_CONFIG
        );
        expect(routes).to.deep.equal({ W1N1: "W1N2" });
    });

    it("no-ops without a donor in range", () => {
        expect(planAidRoutes({ W1N1: RoomLifecycle.Crippled, W9N9: RoomLifecycle.Stable }, distance, EMPIRE_CONFIG)).to.deep.equal({});
        expect(planAidRoutes({ W1N1: RoomLifecycle.Crippled }, distance, EMPIRE_CONFIG)).to.deep.equal({});
    });

    it("rewrites home and floors priority INSIDE the live band, leaving other demands alone", () => {
        const demands = [demand("W1N1", 1), demand("W1N2", 100)];
        const out = brokerAid(demands, { W1N1: "W1N2" }, EMPIRE_CONFIG);
        expect(out[0].home).to.equal("W1N2");
        expect(out[0].priority).to.equal(EMPIRE_CONFIG.aidPriorityFloor);
        // 95: after the reserver (90), before home upgraders (100). Above 100 is a
        // dead band — the resolver's head-of-line break means "never spawns".
        expect(EMPIRE_CONFIG.aidPriorityFloor).to.be.lessThan(100);
        expect(out[0].id).to.equal(demands[0].id); // id keeps encoding the origin
        expect(out[1]).to.deep.equal(demands[1]); // untouched
    });

    it("never lowers an already-urgent aid demand's number", () => {
        const out = brokerAid([demand("W1N1", 120)], { W1N1: "W1N2" }, EMPIRE_CONFIG);
        expect(out[0].priority).to.equal(120);
    });

    it("DEMOTES an urgent demand to the floor — a donor never starves for a sibling", () => {
        // Priority 0 is defense's "spawn a defender now". Re-homed to a donor it
        // must NOT outrank that donor's own bootstrap miner (1): aid is help, not
        // a hostile takeover of someone else's spawn queue.
        const out = brokerAid([demand("W1N1", 0)], { W1N1: "W1N2" }, EMPIRE_CONFIG);
        expect(out[0].priority).to.equal(EMPIRE_CONFIG.aidPriorityFloor);
        expect(EMPIRE_CONFIG.aidPriorityFloor).to.be.greaterThan(90); // behind every income tier
    });
});
