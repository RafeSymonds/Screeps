import { expect } from "../helpers/chai";
import { AssignmentKind } from "shared/assignments";
import { CreepView, Pos, RoomSnapshot } from "shared/views";
import { builderBody, haulerBody, minerBody, MINER_MIN_BODY, upgraderBody } from "economy/bodies";
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
        kind === AssignmentKind.Upgrade || kind === AssignmentKind.Build
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
        // A hauler-shaped body for hauler roles: a CARRY-less "hauler" is not one,
        // and the planner now refuses to count undersized bodies as staffed.
        bodyCounts:
            kind === AssignmentKind.Haul
                ? { [CARRY]: 3, [MOVE]: 3 }
                : { [WORK]: 2, [CARRY]: 1, [MOVE]: 1 },
        store: { free: 0, used: 0, byResource: {} },
        memory: { home: "W1N1", assignment } as CreepMemory,
        ...overrides
    };
}

function orphan(name: string, bodyCounts: Partial<Record<BodyPartConstant, number>>): CreepView {
    return {
        name,
        id: "oid" as Id<Creep>,
        pos: pos(24, 24),
        hits: 100,
        hitsMax: 100,
        ticksToLive: 1400,
        spawning: false,
        bodyCounts,
        store: { free: 50, used: 0, byResource: {} },
        memory: {} as CreepMemory
    };
}

/** The CPU allowance the fixture plans against. Was ALLOWED
 *  before principle 8 made the cap a computed input (shared/budget.ts). */
const ALLOWED = 20;

function input(roster: CreepView[] = []): RoomPlanInput {
    return {
        room: gateRoom(),
        creepsAllowed: ALLOWED,
        roster,
        orphans: [],
        sourceSpots: { srcA: 3, srcB: 3 },
        upgradeSpot: pos(25, 21),
        allowRebuild: true,
        config: ECONOMY_CONFIG
    };
}

describe("economy bodies", () => {
    it("scales miner WORK with capacity and carries NOTHING — a miner only mines", () => {
        expect(counts(minerBody(300))).to.deep.equal({ [WORK]: 2, [MOVE]: 1 });
        // The freed slot becomes WORK: 5 at 550 where the carrying miner got 4.
        expect(counts(minerBody(550))).to.deep.equal({ [WORK]: 5, [MOVE]: 1 });
        expect(counts(minerBody(800))).to.deep.equal({ [WORK]: 7, [MOVE]: 2 });
        const big = counts(minerBody(2000));
        expect(big[WORK]).to.equal(18);
        expect(big[CARRY]).to.equal(undefined);
        expect(big[MOVE]).to.equal(4);
        // Harvest overflow drops into the container underfoot, so carry capacity
        // buys no throughput — it just parks 50 energy inside the creep.
        expect(MINER_MIN_BODY).to.deep.equal([WORK, MOVE]);
    });

    it("gives a miner exactly one CARRY when a link serves its source", () => {
        // Somebody has to put energy INTO a source link, and it is the miner
        // standing beside it (economy.md "Links") — the sole exception.
        expect(counts(minerBody(550, true))).to.deep.equal({ [WORK]: 4, [CARRY]: 1, [MOVE]: 1 });
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

    it("uses [W,C,C,M] builder units", () => {
        expect(counts(builderBody(300))).to.deep.equal({ [WORK]: 1, [CARRY]: 2, [MOVE]: 1 });
        expect(counts(builderBody(550))).to.deep.equal({ [WORK]: 2, [CARRY]: 4, [MOVE]: 2 });
    });
});

describe("economy planner", () => {
    it("demands the gate-map steady state: 6 miners, 7 haulers, 7 upgraders", () => {
        const { demands } = planRoom(input());
        const byKind = Object.groupBy(demands, d => d.assignment.kind);
        expect(byKind[AssignmentKind.Mine]).to.have.length(6);
        expect(byKind[AssignmentKind.Haul]).to.have.length(7);
        expect(byKind[AssignmentKind.Upgrade]).to.have.length(7);
        expect(demands).to.have.length(ALLOWED);
    });

    it("interleaves miners and haulers pairwise; upgraders last", () => {
        const { demands } = planRoom(input());
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
        const midRamp = planRoom(input([worker(AssignmentKind.Mine, "srcA"), worker(AssignmentKind.Haul, "srcA")])).demands;
        expect(midRamp[0].assignment.kind).to.equal(AssignmentKind.Mine);
        expect(midRamp[1].assignment.kind).to.equal(AssignmentKind.Haul);

        // 2 miners + 1 hauler: hauler slot 1 (prio 6) now beats miner slot 2 (prio 7).
        const twoMiners = planRoom(
            input([
                worker(AssignmentKind.Mine, "srcA"),
                worker(AssignmentKind.Mine, "srcA"),
                worker(AssignmentKind.Haul, "srcA")
            ])
        ).demands;
        expect(twoMiners[0].assignment.kind).to.equal(AssignmentKind.Haul);
        expect(twoMiners[1].assignment.kind).to.equal(AssignmentKind.Mine);
    });

    it("attaches minBody while an income role is critically short, not only at zero", () => {
        const empty = planRoom(input()).demands;
        expect(empty.find(d => d.assignment.kind === AssignmentKind.Mine)?.minBody).to.deep.equal([WORK, MOVE]);
        expect(empty.find(d => d.assignment.kind === AssignmentKind.Haul)?.minBody).to.deep.equal([CARRY, MOVE]);

        // One miner of two sources is still critically short: it must be allowed
        // to spawn whatever the room can afford rather than block for the ideal
        // body while an unmined source earns nothing.
        const withMiner = planRoom(input([worker(AssignmentKind.Mine, "srcA")])).demands;
        expect(withMiner.find(d => d.assignment.kind === AssignmentKind.Mine)?.minBody).to.deep.equal([WORK, MOVE]);
        expect(withMiner.find(d => d.assignment.kind === AssignmentKind.Haul)?.minBody).to.deep.equal([CARRY, MOVE]);

        // Fully staffed miners: back to saving up for the ideal body.
        const staffedMiners = planRoom(
            input([worker(AssignmentKind.Mine, "srcA"), worker(AssignmentKind.Mine, "srcB")])
        ).demands;
        expect(staffedMiners.find(d => d.assignment.kind === AssignmentKind.Mine)?.minBody).to.equal(undefined);
    });

    it("stops demanding miners at WORK saturation or seat limits", () => {
        const staffed = [
            worker(AssignmentKind.Mine, "srcA"),
            worker(AssignmentKind.Mine, "srcA"),
            worker(AssignmentKind.Mine, "srcA")
        ];
        const { demands } = planRoom(input(staffed));
        const miners = demands.filter(d => d.assignment.kind === AssignmentKind.Mine);
        expect(miners.every(d => (d.assignment as { sourceId: string }).sourceId === "srcB")).to.equal(true);

        const twoSeats = planRoom({ ...input(), sourceSpots: { srcA: 2, srcB: 2 } }).demands;
        expect(twoSeats.filter(d => d.assignment.kind === AssignmentKind.Mine)).to.have.length(4);
    });

    it("emits only top-ups for a fully staffed room", () => {
        const roster: CreepView[] = [];
        for (let i = 0; i < 3; i++) roster.push(worker(AssignmentKind.Mine, "srcA"));
        for (let i = 0; i < 3; i++) roster.push(worker(AssignmentKind.Mine, "srcB"));
        for (let i = 0; i < 4; i++) roster.push(worker(AssignmentKind.Haul, "srcA"));
        for (let i = 0; i < 3; i++) roster.push(worker(AssignmentKind.Haul, "srcB"));
        for (let i = 0; i < 7; i++) roster.push(worker(AssignmentKind.Upgrade, undefined));
        expect(planRoom(input(roster)).demands).to.have.length(0);
    });

    it("replaces a pre-spawn-aged creep before it dies", () => {
        const aged = worker(AssignmentKind.Mine, "srcA", { ticksToLive: 55 }); // 3 parts → threshold 59
        const fresh = worker(AssignmentKind.Mine, "srcA", { ticksToLive: 70 });
        const withAged = planRoom(input([aged])).demands;
        const withFresh = planRoom(input([fresh])).demands;
        const minersA = (ds: typeof withAged): number =>
            ds.filter(d => d.assignment.kind === AssignmentKind.Mine && (d.assignment as { sourceId: string }).sourceId === "srcA").length;
        expect(minersA(withAged)).to.equal(3);
        expect(minersA(withFresh)).to.equal(2);
    });

    it("never demands zero upgraders — a hauler slot is forfeited instead", () => {
        const squeezed = planRoom({ ...input(), creepsAllowed: 13 }).demands;
        const byKind = Object.groupBy(squeezed, d => d.assignment.kind);
        expect(byKind[AssignmentKind.Upgrade]!.length).to.be.at.least(1);
        expect(byKind[AssignmentKind.Mine]).to.have.length(6);
    });

    it("returns nothing for a sourceless room, but a REBUILD SKELETON for a spawnless one", () => {
        const noSources = { ...gateRoom(), sources: [] };
        expect(planRoom({ ...input(), room: noSources }).demands).to.have.length(0);

        // M6: a spawnless owned room can't spawn its own recovery, so it emits the
        // skeleton for empire's aid pass to re-home to a donor. Returning [] here
        // made brokerAid a guaranteed no-op on its only real customer.
        const noSpawn = { ...gateRoom(), structures: {} };
        const skeleton = planRoom({ ...input(), room: noSpawn }).demands;
        const kinds = skeleton.map(d => d.assignment.kind);
        expect(kinds).to.include(AssignmentKind.Mine);
        expect(kinds).to.include(AssignmentKind.Haul);
        expect(kinds).to.include(AssignmentKind.Build);
        expect(skeleton.every(d => d.home === "W1N1")).to.equal(true);
        // Bootstrap-sized: the donor spawns these, and a 1300-body would wedge it.
        expect(skeleton.find(d => d.assignment.kind === AssignmentKind.Mine)!.body).to.deep.equal(minerBody(300));

        // ...but NOT while expansion is pioneering it: that bootstrap has an owner.
        expect(planRoom({ ...input(), room: noSpawn, allowRebuild: false }).demands).to.have.length(0);
    });

    it("fields builders while sites are open and throttles upgraders to the floor", () => {
        const room = gateRoom();
        room.myConstructionSites = [
            {
                id: "site1" as Id<ConstructionSite>,
                pos: pos(26, 24),
                type: STRUCTURE_EXTENSION,
                progress: 0,
                progressTotal: 3000
            }
        ];
        const { demands } = planRoom({ ...input(), room });
        const byKind = Object.groupBy(demands, d => d.assignment.kind);
        expect(byKind[AssignmentKind.Build]).to.have.length(ECONOMY_CONFIG.builders);
        expect(byKind[AssignmentKind.Build]!.every(d => d.minBody === undefined)).to.equal(true);
        // Construction throttles upgrading at the energy level: floor of 1 only.
        expect(byKind[AssignmentKind.Upgrade]).to.have.length(1);
        const kinds = demands.map(d => d.assignment.kind);
        expect(kinds.lastIndexOf(AssignmentKind.Haul)).to.be.lessThan(kinds.indexOf(AssignmentKind.Build));
        expect(kinds.lastIndexOf(AssignmentKind.Build)).to.be.lessThan(kinds.indexOf(AssignmentKind.Upgrade));
    });

    it("treats maintenance sites as a 1-builder crew, not the investment regime", () => {
        const room = gateRoom();
        room.myConstructionSites = [
            { id: "r1" as Id<ConstructionSite>, pos: pos(24, 24), type: STRUCTURE_ROAD, progress: 0, progressTotal: 300 },
            { id: "r2" as Id<ConstructionSite>, pos: pos(23, 24), type: STRUCTURE_RAMPART, progress: 0, progressTotal: 1 }
        ];
        const { demands } = planRoom({ ...input(), room });
        const byKind = Object.groupBy(demands, d => d.assignment.kind);
        expect(byKind[AssignmentKind.Build]).to.have.length(1); // maintenance crew only
        // Upgraders NOT throttled: road/rampart sites recur forever (the livelock fix).
        expect(byKind[AssignmentKind.Upgrade]!.length).to.be.at.least(6);
    });

    it("converts surplus upgraders to builders instead of spawning", () => {
        const room = gateRoom();
        room.myConstructionSites = [
            {
                id: "site1" as Id<ConstructionSite>,
                pos: pos(26, 24),
                type: STRUCTURE_EXTENSION,
                progress: 0,
                progressTotal: 3000
            }
        ];
        const upgraders = [
            worker(AssignmentKind.Upgrade, undefined, { name: "up-old", ticksToLive: 400 }),
            worker(AssignmentKind.Upgrade, undefined, { name: "up-mid", ticksToLive: 900 }),
            worker(AssignmentKind.Upgrade, undefined, { name: "up-new", ticksToLive: 1400 })
        ];
        const plan = planRoom({ ...input(upgraders), room });
        // 3 alive, floor 1 → 2 surplus convert (freshest first); 2 builder spawns remain.
        expect(plan.reassignments.map(r => r.name)).to.deep.equal(["up-new", "up-mid"]);
        expect(plan.reassignments.every(r => r.assignment.kind === AssignmentKind.Build)).to.equal(true);
        expect(plan.demands.filter(d => d.assignment.kind === AssignmentKind.Build)).to.have.length(
            ECONOMY_CONFIG.builders - 2
        );
        // No upgrader spawn demand: the floor is already staffed by the one kept.
        expect(plan.demands.filter(d => d.assignment.kind === AssignmentKind.Upgrade)).to.have.length(0);

        // No sites → no conversion, upgraders keep their jobs.
        const quiet = planRoom(input(upgraders));
        expect(quiet.reassignments).to.have.length(0);
    });

    it("sizes bodies to 300 while income staffing is below floor (wipe recovery)", () => {
        // A wiped high-cap room: no creeps, cap 1300 — bodies must NOT be 1300-sized.
        const rich = gateRoom();
        rich.energyCapacityAvailable = 1300;
        rich.energyAvailable = 1300;
        const wiped = planRoom({ ...input(), room: rich });
        const miner = wiped.demands.find(d => d.assignment.kind === AssignmentKind.Mine)!;
        const hauler = wiped.demands.find(d => d.assignment.kind === AssignmentKind.Haul)!;
        expect(miner.body).to.deep.equal(minerBody(300));
        expect(hauler.body).to.deep.equal(haulerBody(300));

        // Income staffed (2 miners, 2 haulers alive): replacements size to capacity.
        const staffed = [
            worker(AssignmentKind.Mine, "srcA"),
            worker(AssignmentKind.Mine, "srcB"),
            worker(AssignmentKind.Haul, "srcA"),
            worker(AssignmentKind.Haul, "srcB")
        ];
        const healthy = planRoom({ ...input(staffed), room: rich });
        const bigUpgrader = healthy.demands.find(d => d.assignment.kind === AssignmentKind.Upgrade)!;
        expect(bigUpgrader.body).to.deep.equal(upgraderBody(1300));
    });

    it("adopts orphans into gaps by body fit instead of spawning", () => {
        // A [W,C,M] generalist fills the first (miner) gap; its spawn demand disappears.
        const plan = planRoom({ ...input(), orphans: [orphan("seed0", { [WORK]: 1, [CARRY]: 1, [MOVE]: 1 })] });
        expect(plan.adoptions).to.have.length(1);
        expect(plan.adoptions[0].name).to.equal("seed0");
        expect(plan.adoptions[0].assignment.kind).to.equal(AssignmentKind.Mine);
        expect(plan.demands).to.have.length(ALLOWED - 1);

        // A CARRY-only body can't mine — it takes the first hauler gap instead.
        const ferry = planRoom({ ...input(), orphans: [orphan("boxcar", { [CARRY]: 1, [MOVE]: 1 })] });
        expect(ferry.adoptions[0].assignment.kind).to.equal(AssignmentKind.Haul);

        // A MOVE-only body fits nothing: no adoption, full demand list.
        const legs = planRoom({ ...input(), orphans: [orphan("legs", { [MOVE]: 1 })] });
        expect(legs.adoptions).to.have.length(0);
        expect(legs.demands).to.have.length(ALLOWED);
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
