import { expect } from "../helpers/chai";
import { AssignmentKind } from "shared/assignments";
import { CreepView, Pos, RoomSnapshot } from "shared/views";
import { haulerBody, minerBody, upgraderBody } from "economy/bodies";
import { ECONOMY_CONFIG } from "economy/config";
import { planRoom, RoomPlanInput } from "economy/planner";
import { chooseUpgradeSpot, countAdjacentSpots } from "economy/spots";
import { TerrainGrid } from "snapshot/terrain";

function pos(x: number, y: number, roomName = "W1N1"): Pos {
    return { x, y, roomName };
}

function counts(body: BodyPartConstant[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const part of body) out[part] = (out[part] ?? 0) + 1;
    return out;
}

/** The M2 gate world: spawn (25,25), sources (10,40)/(40,40), controller (25,18). */
function gateRoom(): RoomSnapshot {
    return {
        name: "W1N1",
        my: true,
        controller: {
            id: "ctrl" as Id<StructureController>,
            pos: pos(25, 18),
            level: 1,
            my: true,
            progress: 0,
            progressTotal: 200,
            ticksToDowngrade: 20000,
            safeModeAvailable: 1
        },
        energyAvailable: 300,
        energyCapacityAvailable: 300,
        sources: [
            { id: "srcA" as Id<Source>, pos: pos(10, 40), energy: 3000, energyCapacity: 3000 },
            { id: "srcB" as Id<Source>, pos: pos(40, 40), energy: 3000, energyCapacity: 3000 }
        ],
        structures: {
            [STRUCTURE_SPAWN]: [
                {
                    id: "spawn1" as Id<AnyStructure>,
                    type: STRUCTURE_SPAWN,
                    pos: pos(25, 25),
                    hits: 5000,
                    hitsMax: 5000,
                    spawning: false
                }
            ]
        },
        myConstructionSites: [],
        hostiles: [],
        dropped: []
    };
}

function worker(kind: AssignmentKind, sourceId: string | undefined, overrides: Partial<CreepView> = {}): CreepView {
    const assignment =
        kind === AssignmentKind.Upgrade
            ? { kind, room: "W1N1" }
            : { kind, room: "W1N1", sourceId: sourceId as Id<Source> };
    return {
        name: `${kind}-${sourceId ?? "x"}-${Math.floor(Math.random() * 1e6)}`,
        id: "cid" as Id<Creep>,
        pos: pos(20, 20),
        hits: 100,
        hitsMax: 100,
        ticksToLive: 1400,
        spawning: false,
        bodyCounts: { [WORK]: 2, [MOVE]: 1 },
        store: { free: 0, used: 0, byResource: {} },
        memory: { home: "W1N1", assignment } as CreepMemory,
        ...overrides
    };
}

function input(roster: CreepView[] = []): RoomPlanInput {
    return {
        room: gateRoom(),
        roster,
        sourceSpots: { srcA: 3, srcB: 3 },
        upgradeSpot: pos(25, 21),
        config: ECONOMY_CONFIG
    };
}

describe("economy bodies", () => {
    it("scales miner WORK with capacity, unbounded except the 50-part limit", () => {
        expect(counts(minerBody(300))).to.deep.equal({ [WORK]: 2, [MOVE]: 1 });
        expect(counts(minerBody(550))).to.deep.equal({ [WORK]: 5, [MOVE]: 1 });
        const big = counts(minerBody(2000));
        expect(big[WORK]).to.equal(18);
        expect(big[MOVE]).to.equal(4);
    });

    it("scales hauler pairs with capacity", () => {
        expect(counts(haulerBody(300))).to.deep.equal({ [CARRY]: 3, [MOVE]: 3 });
        expect(counts(haulerBody(2000))).to.deep.equal({ [CARRY]: 20, [MOVE]: 20 });
        expect(haulerBody(5000)).to.have.length(50); // game limit only
    });

    it("uses [W,W,C,M] upgrader units with no stranded energy at 300", () => {
        expect(counts(upgraderBody(300))).to.deep.equal({ [WORK]: 2, [CARRY]: 1, [MOVE]: 1 });
        expect(counts(upgraderBody(2000))).to.deep.equal({ [WORK]: 12, [CARRY]: 6, [MOVE]: 6 });
    });
});

describe("economy planner", () => {
    it("demands the gate-map steady state: 6 miners, 7 haulers, 7 upgraders", () => {
        const demands = planRoom(input());
        const byKind = Object.groupBy(demands, d => d.assignment.kind);
        expect(byKind[AssignmentKind.Mine]).to.have.length(6);
        expect(byKind[AssignmentKind.Haul]).to.have.length(7);
        expect(byKind[AssignmentKind.Upgrade]).to.have.length(7);
        expect(demands).to.have.length(ECONOMY_CONFIG.maxCreepsPerRoom);
    });

    it("interleaves miners and haulers pairwise; upgraders last", () => {
        const demands = planRoom(input());
        const kinds = demands.map(d => d.assignment.kind);
        expect(kinds.slice(0, 6)).to.deep.equal([
            AssignmentKind.Mine,
            AssignmentKind.Haul,
            AssignmentKind.Mine,
            AssignmentKind.Haul,
            AssignmentKind.Mine,
            AssignmentKind.Haul
        ]);
        expect(kinds.lastIndexOf(AssignmentKind.Haul)).to.be.lessThan(kinds.indexOf(AssignmentKind.Upgrade));
    });

    it("keeps alternating under replanning — staffed slots consume the low priorities", () => {
        // 1 miner + 1 hauler alive: the next two demands must be miner then hauler,
        // not miner forever (the memoryless gap-indexed bug sim caught).
        const midRamp = planRoom(input([worker(AssignmentKind.Mine, "srcA"), worker(AssignmentKind.Haul, "srcA")]));
        expect(midRamp[0].assignment.kind).to.equal(AssignmentKind.Mine);
        expect(midRamp[1].assignment.kind).to.equal(AssignmentKind.Haul);

        // 2 miners + 1 hauler: hauler slot 1 (prio 6) now beats miner slot 2 (prio 7).
        const twoMiners = planRoom(
            input([
                worker(AssignmentKind.Mine, "srcA"),
                worker(AssignmentKind.Mine, "srcA"),
                worker(AssignmentKind.Haul, "srcA")
            ])
        );
        expect(twoMiners[0].assignment.kind).to.equal(AssignmentKind.Haul);
        expect(twoMiners[1].assignment.kind).to.equal(AssignmentKind.Mine);
    });

    it("attaches minBody per role only while that role has zero creeps", () => {
        const empty = planRoom(input());
        expect(empty.find(d => d.assignment.kind === AssignmentKind.Mine)?.minBody).to.deep.equal([WORK, MOVE]);
        expect(empty.find(d => d.assignment.kind === AssignmentKind.Haul)?.minBody).to.deep.equal([CARRY, MOVE]);

        const withMiner = planRoom(input([worker(AssignmentKind.Mine, "srcA")]));
        expect(withMiner.find(d => d.assignment.kind === AssignmentKind.Mine)?.minBody).to.equal(undefined);
        expect(withMiner.find(d => d.assignment.kind === AssignmentKind.Haul)?.minBody).to.deep.equal([CARRY, MOVE]);
    });

    it("stops demanding miners at WORK saturation or seat limits", () => {
        const staffed = [
            worker(AssignmentKind.Mine, "srcA"),
            worker(AssignmentKind.Mine, "srcA"),
            worker(AssignmentKind.Mine, "srcA")
        ];
        const demands = planRoom(input(staffed));
        const miners = demands.filter(d => d.assignment.kind === AssignmentKind.Mine);
        expect(miners.every(d => (d.assignment as { sourceId: string }).sourceId === "srcB")).to.equal(true);

        const twoSeats = planRoom({ ...input(), sourceSpots: { srcA: 2, srcB: 2 } });
        expect(twoSeats.filter(d => d.assignment.kind === AssignmentKind.Mine)).to.have.length(4);
    });

    it("emits only top-ups for a fully staffed room", () => {
        const roster: CreepView[] = [];
        for (let i = 0; i < 3; i++) roster.push(worker(AssignmentKind.Mine, "srcA"));
        for (let i = 0; i < 3; i++) roster.push(worker(AssignmentKind.Mine, "srcB"));
        for (let i = 0; i < 4; i++) roster.push(worker(AssignmentKind.Haul, "srcA"));
        for (let i = 0; i < 3; i++) roster.push(worker(AssignmentKind.Haul, "srcB"));
        for (let i = 0; i < 7; i++) roster.push(worker(AssignmentKind.Upgrade, undefined));
        expect(planRoom(input(roster))).to.have.length(0);
    });

    it("replaces a pre-spawn-aged creep before it dies", () => {
        const aged = worker(AssignmentKind.Mine, "srcA", { ticksToLive: 55 }); // 3 parts → threshold 59
        const fresh = worker(AssignmentKind.Mine, "srcA", { ticksToLive: 70 });
        const withAged = planRoom(input([aged]));
        const withFresh = planRoom(input([fresh]));
        const minersA = (ds: typeof withAged): number =>
            ds.filter(d => d.assignment.kind === AssignmentKind.Mine && (d.assignment as { sourceId: string }).sourceId === "srcA").length;
        expect(minersA(withAged)).to.equal(3);
        expect(minersA(withFresh)).to.equal(2);
    });

    it("never demands zero upgraders — a hauler slot is forfeited instead", () => {
        const squeezed = planRoom({ ...input(), config: { ...ECONOMY_CONFIG, maxCreepsPerRoom: 13 } });
        const byKind = Object.groupBy(squeezed, d => d.assignment.kind);
        expect(byKind[AssignmentKind.Upgrade]!.length).to.be.at.least(1);
        expect(byKind[AssignmentKind.Mine]).to.have.length(6);
    });

    it("returns nothing for a room with no sources or no spawn", () => {
        const noSources = { ...gateRoom(), sources: [] };
        expect(planRoom({ ...input(), room: noSources })).to.have.length(0);
        const noSpawn = { ...gateRoom(), structures: {} };
        expect(planRoom({ ...input(), room: noSpawn })).to.have.length(0);
    });
});

describe("economy spots", () => {
    const openTerrain: TerrainGrid = { isWall: () => false, isSwamp: () => false };

    it("counts walkable seats around a source", () => {
        expect(countAdjacentSpots(openTerrain, pos(25, 25))).to.equal(8);
        const walledExceptOne: TerrainGrid = {
            isWall: (x, y) => !(x === 24 && y === 25),
            isSwamp: () => false
        };
        expect(countAdjacentSpots(walledExceptOne, pos(25, 25))).to.equal(1);
    });

    it("chooses an open range-3 tile at minimal spawn distance", () => {
        const spot = chooseUpgradeSpot(openTerrain, pos(25, 18), pos(25, 25))!;
        const toController = Math.max(Math.abs(spot.x - 25), Math.abs(spot.y - 18));
        const toSpawn = Math.max(Math.abs(spot.x - 25), Math.abs(spot.y - 25));
        expect(toController).to.be.at.most(3);
        expect(toSpawn).to.equal(4); // the minimum achievable from the range-3 ring
    });

    it("prefers tiles with ≥3 walkable neighbors over closer cramped ones", () => {
        // Everything below y=19 is wall except a cramped pocket at (25,21); open area at y≤17.
        const terrain: TerrainGrid = {
            isWall: (x, y) => y >= 19 && !(x === 25 && y === 21),
            isSwamp: () => false
        };
        const spot = chooseUpgradeSpot(terrain, pos(25, 18), pos(25, 25));
        expect(spot!.y).to.be.lessThan(19); // cramped (25,21) skipped despite being closer to spawn
    });
});
