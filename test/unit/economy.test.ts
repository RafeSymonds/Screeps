import { expect } from "../helpers/chai";
import { AssignmentKind } from "shared/assignments";
import { CreepView, Pos, RoomSnapshot } from "shared/views";
import { MINER_MIN_BODY, haulerBody, minerBody, workerBody } from "economy/bodies";
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
        kind === AssignmentKind.Work
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
        expect(counts(minerBody(550, { withLink: true }))).to.deep.equal({ [WORK]: 4, [CARRY]: 1, [MOVE]: 1 });
    });

    it("scales hauler pairs with capacity", () => {
        expect(counts(haulerBody(300))).to.deep.equal({ [CARRY]: 3, [MOVE]: 3 });
        expect(counts(haulerBody(2000))).to.deep.equal({ [CARRY]: 20, [MOVE]: 20 });
        expect(haulerBody(5000)).to.have.length(50); // game limit only
    });

    it("uses balanced [W,C,M] worker units — one body builds, upgrades and harvests", () => {
        expect(counts(workerBody(200))).to.deep.equal({ [WORK]: 1, [CARRY]: 1, [MOVE]: 1 });
        expect(counts(workerBody(600))).to.deep.equal({ [WORK]: 3, [CARRY]: 3, [MOVE]: 3 });
        // Scales with capacity, bounded by the 50-part limit.
        expect(workerBody(100_000)).to.have.length(48);
    });
});

describe("economy planner", () => {
    it("demands the gate-map steady state: 6 miners, 7 haulers, 7 upgraders", () => {
        const { demands } = planRoom(input());
        const byKind = Object.groupBy(demands, d => d.assignment.kind);
        expect(byKind[AssignmentKind.Mine]).to.have.length(6);
        expect(byKind[AssignmentKind.Haul]).to.have.length(7);
        expect(byKind[AssignmentKind.Work]).to.have.length(7);
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
        expect(kinds.lastIndexOf(AssignmentKind.Haul)).to.be.lessThan(kinds.indexOf(AssignmentKind.Work));
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
        for (let i = 0; i < 7; i++) roster.push(worker(AssignmentKind.Work, undefined));
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
        expect(byKind[AssignmentKind.Work]!.length).to.be.at.least(1);
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
        expect(kinds).to.include(AssignmentKind.Work);
        expect(skeleton.every(d => d.home === "W1N1")).to.equal(true);
        // Bootstrap-sized: the donor spawns these, and a 1300-body would wedge it.
        expect(skeleton.find(d => d.assignment.kind === AssignmentKind.Mine)!.body).to.deep.equal(minerBody(300));

        // ...but NOT while expansion is pioneering it: that bootstrap has an owner.
        expect(planRoom({ ...input(), room: noSpawn, allowRebuild: false }).demands).to.have.length(0);
    });

    it("makes workers the residual after income, and queues them behind it", () => {
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
        // There is no builder/upgrader split any more: one Work role, sized as
        // whatever the CPU allowance has left once miners and haulers are staffed.
        expect(byKind[AssignmentKind.Work]).to.not.equal(undefined);
        // Income is ALWAYS queued ahead of workers — a room can build more workers
        // later, but workers cannot fix an unstaffed source.
        const kinds = demands.map(d => d.assignment.kind);
        expect(kinds.lastIndexOf(AssignmentKind.Mine)).to.be.lessThan(kinds.indexOf(AssignmentKind.Work));
        expect(kinds.lastIndexOf(AssignmentKind.Haul)).to.be.lessThan(kinds.indexOf(AssignmentKind.Work));
    });

    it("never squeezes haulers while workers remain — investment yields before income", () => {
        // FIELD BUG: with a tight CPU allowance the old rule dumped the entire
        // shortfall onto haulers (cutting them to ONE) while leaving four builders
        // untouched. A room that mines but cannot move what it mines piles energy
        // on the floor and starves its own spawn.
        const count = (p: ReturnType<typeof planRoom>, k: AssignmentKind): number =>
            p.demands.filter(d => d.assignment.kind === k).length;
        const generous = planRoom({ ...input(), creepsAllowed: 20 });
        const tight = planRoom({ ...input(), creepsAllowed: 12 });
        // Workers absorb the squeeze...
        expect(count(tight, AssignmentKind.Work)).to.be.lessThan(count(generous, AssignmentKind.Work));
        // ...and haulers are not gutted to a single creep to pay for them.
        expect(count(tight, AssignmentKind.Haul)).to.be.greaterThan(1);
    });

    it("sizes workers to CONSUME what the room produces, both directions", () => {
        // FIELD BUG: consumption ran far behind production. Workers were the only
        // role derived from nothing — just the CPU allowance leftover — so at
        // capacity 300 eight 1-WORK workers consumed 8 e/t against 20 e/t of
        // production, and the surplus piled up forever.
        const poor = gateRoom();
        poor.energyCapacityAvailable = 300;
        poor.energyAvailable = 300;
        const rich = gateRoom();
        rich.energyCapacityAvailable = 1300;
        rich.energyAvailable = 1300;

        // Bodies are pinned to 300 while income staffing is below floor (wipe
        // recovery), so a staffed roster is required to see capacity-sized workers.
        const staffed = [
            worker(AssignmentKind.Mine, "srcA"),
            worker(AssignmentKind.Mine, "srcB"),
            worker(AssignmentKind.Haul, "srcA"),
            worker(AssignmentKind.Haul, "srcB")
        ];
        const plan = (room: RoomSnapshot) => planRoom({ ...input(staffed), room, creepsAllowed: 40 });
        const workOf = (room: RoomSnapshot): number =>
            plan(room)
                .demands.filter(d => d.assignment.kind === AssignmentKind.Work)
                .reduce((sum, d) => sum + d.body.filter(p => p === WORK).length, 0);
        // A rich room fields enough WORK to consume its whole 20 e/t.
        expect(workOf(rich)).to.be.at.least(20);
        // A poor room cannot: at capacity 300 a worker is 1 WORK, so consuming
        // 20 e/t would take 20 creeps, which is CPU-absurd and is what the
        // maxWorkers rail exists to refuse. Early surplus is real and it is
        // self-correcting — it funds the extensions that raise the cap, which
        // makes each worker bigger. What matters is that it now asks for as much
        // consumption as it is allowed, instead of an unrelated leftover.
        expect(workOf(poor)).to.equal(ECONOMY_CONFIG.maxWorkers);
        // ...and the rich room does it with far fewer creeps.
        const count = (room: RoomSnapshot): number =>
            plan(room).demands.filter(d => d.assignment.kind === AssignmentKind.Work).length;
        expect(count(rich)).to.be.lessThan(count(poor));
    });

    it("needs no reassignment pass at all — workers self-allocate", () => {
        // The old planner converted surplus upgraders into builders whenever the
        // construction regime flipped. One role means the split is decided by each
        // worker looking at the room, every tick, for free.
        const workers = [
            worker(AssignmentKind.Work, undefined, { name: "w-old", ticksToLive: 400 }),
            worker(AssignmentKind.Work, undefined, { name: "w-new", ticksToLive: 1400 })
        ];
        expect(planRoom(input(workers)).reassignments).to.have.length(0);
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
        const bigUpgrader = healthy.demands.find(d => d.assignment.kind === AssignmentKind.Work)!;
        expect(bigUpgrader.body).to.deep.equal(workerBody(1300));
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
