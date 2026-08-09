import { expect } from "../helpers/chai";
import { AssignmentKind } from "shared/assignments";
import { SpawnDemand } from "shared/spawning";
import { SubsystemId } from "shared/subsystems";
import { RoomSnapshot, StructureView } from "shared/views";
import { resolveSpawns } from "spawn/resolver";

function spawnView(id: string, busy: boolean): StructureView {
    return {
        id: id as Id<AnyStructure>,
        type: STRUCTURE_SPAWN,
        pos: { x: 25, y: 25, roomName: "W1N1" },
        hits: 5000,
        hitsMax: 5000,
        spawning: busy
    };
}

function room(energy: number, spawns: StructureView[], capacity = 300): RoomSnapshot {
    return {
        name: "W1N1",
        my: true,
        energyAvailable: energy,
        energyCapacityAvailable: capacity,
        sources: [],
        structures: { [STRUCTURE_SPAWN]: spawns },
        myConstructionSites: [],
        hostiles: [],
        dropped: []
    };
}

function demand(id: string, priority: number, body: BodyPartConstant[], minBody?: BodyPartConstant[]): SpawnDemand {
    return {
        id,
        priority,
        home: "W1N1",
        owner: SubsystemId.Economy,
        assignment: { kind: AssignmentKind.Mine, room: "W1N1", sourceId: "src" as Id<Source> },
        body,
        ...(minBody ? { minBody } : {})
    };
}

const MINER = [WORK, WORK, MOVE]; // 250
const BIG = [WORK, WORK, WORK, MOVE]; // 350

describe("spawn resolver", () => {
    it("services the highest-priority affordable demand", () => {
        const decisions = resolveSpawns(
            [demand("b", 5, MINER), demand("a", 1, MINER)],
            room(300, [spawnView("s1", false)]),
            123
        );
        expect(decisions).to.have.length(1);
        expect(decisions[0].demand.id).to.equal("a");
        expect(decisions[0].body).to.deep.equal(MINER);
        expect(decisions[0].name).to.equal("mine_W1N1_123");
    });

    it("blocks the line behind an unaffordable head (no queue jumping)", () => {
        const decisions = resolveSpawns(
            [demand("expensive", 1, BIG), demand("cheap", 5, [CARRY, MOVE])],
            room(300, [spawnView("s1", false)], 400),
            1
        );
        expect(decisions).to.have.length(0);
    });

    it("falls back to minBody exactly when present and the ideal is unaffordable", () => {
        const withMin = resolveSpawns([demand("m", 1, MINER, [WORK, MOVE])], room(200, [spawnView("s1", false)]), 1);
        expect(withMin).to.have.length(1);
        expect(withMin[0].body).to.deep.equal([WORK, MOVE]);

        const withoutMin = resolveSpawns([demand("m", 1, MINER)], room(200, [spawnView("s1", false)]), 1);
        expect(withoutMin).to.have.length(0);
    });

    it("shares one energy pool across two free spawns", () => {
        const spawns = [spawnView("s1", false), spawnView("s2", false)];
        const decisions = resolveSpawns([demand("a", 1, MINER), demand("b", 2, MINER)], room(300, spawns), 1);
        expect(decisions).to.have.length(1); // 300 can't fund two 250 bodies
        const flush = resolveSpawns([demand("a", 1, [CARRY, MOVE]), demand("b", 2, [CARRY, MOVE])], room(300, spawns), 1);
        expect(flush).to.have.length(2);
        expect(flush.map(d => d.spawnId)).to.deep.equal(["s1", "s2"]);
        expect(flush[1].name).to.equal("mine_W1N1_1_1"); // same-kind same-tick dedupe
    });

    it("skips busy spawns and handles zero spawns", () => {
        expect(resolveSpawns([demand("a", 1, MINER)], room(300, [spawnView("s1", true)]), 1)).to.have.length(0);
        expect(resolveSpawns([demand("a", 1, MINER)], room(300, []), 1)).to.have.length(0);
    });

    it("refuses malformed bodies and blocks the line (defense in depth)", () => {
        const tooBig = demand("big", 1, new Array<BodyPartConstant>(51).fill(MOVE));
        const decisions = resolveSpawns([tooBig, demand("ok", 2, [CARRY, MOVE])], room(300, [spawnView("s1", false)]), 1);
        expect(decisions).to.have.length(0);

        const overCapacity = demand("over", 1, BIG); // 350 > capacity 300
        expect(resolveSpawns([overCapacity], room(300, [spawnView("s1", false)], 300), 1)).to.have.length(0);
    });

    it("carries assignment, owner, and home through unchanged", () => {
        const d = demand("a", 1, MINER);
        const [decision] = resolveSpawns([d], room(300, [spawnView("s1", false)]), 9);
        expect(decision.demand.assignment).to.equal(d.assignment);
        expect(decision.demand.owner).to.equal(SubsystemId.Economy);
        expect(decision.demand.home).to.equal("W1N1");
    });
});
