import { expect } from "../helpers/chai";
import {
    AssignmentKind,
    BuildAssignment,
    DefendAssignment,
    HaulAssignment,
    MineAssignment,
    PioneerAssignment,
    UpgradeAssignment
} from "shared/assignments";
import { ConstructionSiteView, CreepView, DroppedView, HostileView, Pos, RoomSnapshot, StructureView } from "shared/views";
import { FortifyTarget } from "defense/fortify";
import { ActionKind } from "creeps/actions";
import { decideBuild, decideDefend, decideHaul, decideMine, decidePioneer, decideUpgrade } from "creeps/executors";

function pos(x: number, y: number): Pos {
    return { x, y, roomName: "W1N1" };
}

function creepAt(p: Pos, carrying: number): CreepView {
    return {
        name: "c1",
        id: "c1" as Id<Creep>,
        pos: p,
        hits: 100,
        hitsMax: 100,
        ticksToLive: 1000,
        spawning: false,
        bodyCounts: {},
        store: { free: 150 - carrying, used: carrying, byResource: carrying > 0 ? { energy: carrying } : {} },
        memory: {} as CreepMemory
    };
}

function pile(id: string, p: Pos, amount: number): DroppedView {
    return { id: id as Id<Resource>, pos: p, resource: RESOURCE_ENERGY, amount };
}

function roomWith(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
    return {
        name: "W1N1",
        my: true,
        controller: {
            id: "ctrl" as Id<StructureController>,
            pos: pos(25, 18),
            level: 2,
            my: true,
            progress: 0,
            progressTotal: 45000,
            ticksToDowngrade: 20000,
            safeModeAvailable: 1
        },
        energyAvailable: 300,
        energyCapacityAvailable: 300,
        sources: [{ id: "srcA" as Id<Source>, pos: pos(10, 40), energy: 3000, energyCapacity: 3000 }],
        structures: {
            [STRUCTURE_SPAWN]: [
                {
                    id: "spawn1" as Id<AnyStructure>,
                    type: STRUCTURE_SPAWN,
                    pos: pos(25, 25),
                    hits: 5000,
                    hitsMax: 5000,
                    spawning: false,
                    store: { free: 100, used: 200, byResource: { energy: 200 } }
                }
            ]
        },
        myConstructionSites: [],
        hostiles: [],
        dropped: [],
        ...overrides
    };
}

const mine: MineAssignment = { kind: AssignmentKind.Mine, room: "W1N1", sourceId: "srcA" as Id<Source> };
const haul: HaulAssignment = { kind: AssignmentKind.Haul, room: "W1N1", sourceId: "srcA" as Id<Source> };
const upgrade: UpgradeAssignment = { kind: AssignmentKind.Upgrade, room: "W1N1" };
const build: BuildAssignment = { kind: AssignmentKind.Build, room: "W1N1" };
const SPOT = pos(25, 21);

function container(id: string, p: Pos, energy: number, hits = 250000): StructureView {
    return {
        id: id as Id<AnyStructure>,
        type: STRUCTURE_CONTAINER,
        pos: p,
        hits,
        hitsMax: 250000,
        store: { free: 2000 - energy, used: energy, byResource: energy > 0 ? { energy } : {} }
    };
}

function site(id: string, type: StructureConstant, p: Pos, progress: number, progressTotal: number): ConstructionSiteView {
    return { id: id as Id<ConstructionSite>, pos: p, type, progress, progressTotal };
}

describe("mine executor", () => {
    it("harvests in range, moves when far, idles without a source", () => {
        expect(decideMine(creepAt(pos(11, 40), 0), mine, roomWith())).to.deep.equal({
            kind: ActionKind.Harvest,
            targetId: "srcA"
        });
        expect(decideMine(creepAt(pos(20, 20), 0), mine, roomWith())).to.deep.equal({
            kind: ActionKind.MoveTo,
            pos: pos(10, 40),
            range: 1
        });
        expect(decideMine(creepAt(pos(20, 20), 0), mine, roomWith({ sources: [] })).kind).to.equal(ActionKind.Idle);
    });
});

describe("haul executor", () => {
    it("collects the biggest pile at its source, ignoring crumbs", () => {
        const room = roomWith({
            dropped: [pile("small", pos(10, 41), 10), pile("big", pos(11, 40), 300), pile("far", pos(30, 30), 999)]
        });
        expect(decideHaul(creepAt(pos(11, 41), 0), haul, room, SPOT)).to.deep.equal({
            kind: ActionKind.Pickup,
            targetId: "big"
        });
        expect(decideHaul(creepAt(pos(20, 20), 0), haul, room, SPOT)).to.deep.equal({
            kind: ActionKind.MoveTo,
            pos: pos(11, 40),
            range: 1
        });
    });

    it("steps off a miner seat when idle, idles elsewhere", () => {
        const onSeat = decideHaul(creepAt(pos(11, 40), 0), haul, roomWith(), SPOT);
        expect(onSeat.kind).to.equal(ActionKind.MoveTo);
        const offSeat = decideHaul(creepAt(pos(20, 20), 0), haul, roomWith(), SPOT);
        expect(offSeat.kind).to.equal(ActionKind.Idle);
    });

    it("delivers to spawn first, then drops at the upgrade spot when sinks are full", () => {
        const carrying = creepAt(pos(24, 25), 150);
        expect(decideHaul(carrying, haul, roomWith(), SPOT)).to.deep.equal({
            kind: ActionKind.Transfer,
            targetId: "spawn1",
            resource: RESOURCE_ENERGY
        });

        const fullRoom = roomWith();
        fullRoom.structures[STRUCTURE_SPAWN]![0].store = { free: 0, used: 300, byResource: { energy: 300 } };
        expect(decideHaul(creepAt(pos(25, 22), 150), haul, fullRoom, SPOT)).to.deep.equal({
            kind: ActionKind.Drop,
            resource: RESOURCE_ENERGY
        });
        expect(decideHaul(creepAt(pos(40, 40), 150), haul, fullRoom, SPOT)).to.deep.equal({
            kind: ActionKind.MoveTo,
            pos: SPOT,
            range: 1
        });
        expect(decideHaul(creepAt(pos(40, 40), 150), haul, fullRoom, undefined).kind).to.equal(ActionKind.Idle);
    });
});

describe("upgrade executor", () => {
    it("upgrades in range 3, moves to the controller otherwise", () => {
        expect(decideUpgrade(creepAt(pos(25, 20), 50), upgrade, roomWith(), SPOT)).to.deep.equal({
            kind: ActionKind.Upgrade,
            targetId: "ctrl"
        });
        expect(decideUpgrade(creepAt(pos(40, 40), 50), upgrade, roomWith(), SPOT)).to.deep.equal({
            kind: ActionKind.MoveTo,
            pos: pos(25, 18),
            range: 3
        });
    });

    it("refills from the pile near the spot, falling back to the controller anchor", () => {
        const room = roomWith({ dropped: [pile("p1", pos(25, 21), 400)] });
        expect(decideUpgrade(creepAt(pos(25, 22), 0), upgrade, room, SPOT)).to.deep.equal({
            kind: ActionKind.Pickup,
            targetId: "p1"
        });
        expect(decideUpgrade(creepAt(pos(25, 22), 0), upgrade, room, undefined)).to.deep.equal({
            kind: ActionKind.Pickup,
            targetId: "p1" // pile is within 4 of the controller too
        });
        expect(decideUpgrade(creepAt(pos(25, 22), 0), upgrade, roomWith(), SPOT).kind).to.equal(ActionKind.Idle);
    });

    it("idles without a controller", () => {
        expect(decideUpgrade(creepAt(pos(25, 22), 50), upgrade, roomWith({ controller: undefined }), SPOT).kind).to.equal(
            ActionKind.Idle
        );
    });
});

describe("mine executor with a container", () => {
    const seat = pos(11, 40);
    const withContainer = (energy = 0, hits = 250000): RoomSnapshot =>
        roomWith({ structures: { ...roomWith().structures, [STRUCTURE_CONTAINER]: [container("cont1", seat, energy, hits)] } });

    it("targets the container tile as its seat when approaching", () => {
        expect(decideMine(creepAt(pos(20, 20), 0), mine, withContainer())).to.deep.equal({
            kind: ActionKind.MoveTo,
            pos: seat,
            range: 0
        });
    });

    it("sends a miner that does NOT own the seat to the source, not the container", () => {
        // One container, one seat. When every miner targeted it, the losers parked
        // adjacent to the container but 2 tiles from the source — never in harvest
        // range, forever pathing onto an occupied tile. Two miners shoving, zero
        // mining, and downstream: nothing to spawn with and nothing to haul.
        expect(decideMine(creepAt(pos(20, 20), 0), mine, withContainer(), false)).to.deep.equal({
            kind: ActionKind.MoveTo,
            pos: pos(10, 40), // the source itself, range 1 — any free adjacent tile
            range: 1
        });
        // And once adjacent it just mines, rather than chasing the seat.
        expect(decideMine(creepAt(pos(10, 41), 0), mine, withContainer(), false)).to.deep.equal({
            kind: ActionKind.Harvest,
            targetId: "srcA"
        });
    });

    it("harvests on the container; off-seat-but-in-range miners still harvest", () => {
        expect(decideMine(creepAt(seat, 0), mine, withContainer())).to.deep.equal({
            kind: ActionKind.Harvest,
            targetId: "srcA"
        });
        expect(decideMine(creepAt(pos(10, 41), 0), mine, withContainer())).to.deep.equal({
            kind: ActionKind.Harvest,
            targetId: "srcA"
        });
    });

    it("repairs a low container from carried energy, withdrawing a slug when empty", () => {
        const low = withContainer(500, 90000);
        expect(decideMine(creepAt(seat, 30), mine, low)).to.deep.equal({
            kind: ActionKind.Repair,
            targetId: "cont1"
        });
        expect(decideMine(creepAt(seat, 0), mine, low)).to.deep.equal({
            kind: ActionKind.Withdraw,
            targetId: "cont1",
            resource: RESOURCE_ENERGY
        });
        // Low, empty, and container empty too: keep harvesting (drops refill it).
        expect(decideMine(creepAt(seat, 0), mine, withContainer(0, 90000)).kind).to.equal(ActionKind.Harvest);
    });
});

describe("haul executor with containers", () => {
    const seat = pos(11, 40);

    it("collects a stray pile anywhere in the room, but never the upgraders' feed", () => {
        // Source affinity is an assignment detail. Sim-measured: 2,643 energy on
        // the ground and climbing while haulers idled "no-pile", because every
        // pile sat more than two tiles from their own source.
        const strayFar = roomWith({ dropped: [pile("stray", pos(40, 10), 400)] });
        expect(decideHaul(creepAt(pos(38, 10), 0), haul, strayFar, SPOT)).to.deep.equal({
            kind: ActionKind.MoveTo,
            pos: pos(40, 10),
            range: 1
        });
        // The pile at the upgrade spot is the upgraders' feed: taking it would
        // just be re-dropped there next tick.
        const feedOnly = roomWith({ dropped: [pile("feed", SPOT, 900)] });
        expect(decideHaul(creepAt(pos(30, 30), 0), haul, feedOnly, SPOT).kind).to.equal(ActionKind.Idle);
    });

    it("withdraws from the source container before chasing piles", () => {
        const room = roomWith({
            structures: { ...roomWith().structures, [STRUCTURE_CONTAINER]: [container("cont1", seat, 800)] },
            dropped: [pile("p1", pos(10, 41), 300)]
        });
        expect(decideHaul(creepAt(pos(12, 40), 0), haul, room, SPOT)).to.deep.equal({
            kind: ActionKind.Withdraw,
            targetId: "cont1",
            resource: RESOURCE_ENERGY
        });
        // Container short of minPickup → the pile wins.
        const short = roomWith({
            structures: { ...roomWith().structures, [STRUCTURE_CONTAINER]: [container("cont1", seat, 10)] },
            dropped: [pile("p1", pos(10, 41), 300)]
        });
        expect(decideHaul(creepAt(pos(10, 40 + 2), 0), haul, short, SPOT).kind).to.not.equal(ActionKind.Withdraw);
    });

    it("delivers spawn → tower → controller container → drop when the feed is healthy", () => {
        const towered = roomWith();
        towered.structures[STRUCTURE_SPAWN]![0].store = { free: 0, used: 300, byResource: { energy: 300 } };
        towered.structures[STRUCTURE_TOWER] = [
            {
                id: "tow1" as Id<AnyStructure>,
                type: STRUCTURE_TOWER,
                pos: pos(24, 26),
                hits: 3000,
                hitsMax: 3000,
                store: { free: 500, used: 500, byResource: { energy: 500 } }
            }
        ];
        towered.structures[STRUCTURE_CONTAINER] = [container("ctrlCont", SPOT, 500)]; // fed ≥ floor
        expect(decideHaul(creepAt(pos(24, 25), 150), haul, towered, SPOT)).to.deep.equal({
            kind: ActionKind.Transfer,
            targetId: "tow1",
            resource: RESOURCE_ENERGY
        });
        towered.structures[STRUCTURE_TOWER]![0].store = { free: 0, used: 1000, byResource: { energy: 1000 } };
        expect(decideHaul(creepAt(pos(25, 22), 150), haul, towered, SPOT)).to.deep.equal({
            kind: ActionKind.Transfer,
            targetId: "ctrlCont",
            resource: RESOURCE_ENERGY
        });
        towered.structures[STRUCTURE_CONTAINER] = [container("ctrlCont", SPOT, 2000)]; // full
        expect(decideHaul(creepAt(pos(25, 22), 150), haul, towered, SPOT)).to.deep.equal({
            kind: ActionKind.Drop,
            resource: RESOURCE_ENERGY
        });
    });

    it("feeds a starving controller ahead of towers", () => {
        const towered = roomWith();
        towered.structures[STRUCTURE_SPAWN]![0].store = { free: 0, used: 300, byResource: { energy: 300 } };
        towered.structures[STRUCTURE_TOWER] = [
            {
                id: "tow1" as Id<AnyStructure>,
                type: STRUCTURE_TOWER,
                pos: pos(24, 26),
                hits: 3000,
                hitsMax: 3000,
                store: { free: 500, used: 500, byResource: { energy: 500 } }
            }
        ];
        towered.structures[STRUCTURE_CONTAINER] = [container("ctrlCont", SPOT, 100)]; // below the floor
        expect(decideHaul(creepAt(pos(25, 22), 150), haul, towered, SPOT)).to.deep.equal({
            kind: ActionKind.Transfer,
            targetId: "ctrlCont",
            resource: RESOURCE_ENERGY
        });
        // No container yet: a starving spot (no standing pile) wins over the tower too.
        towered.structures[STRUCTURE_CONTAINER] = undefined;
        expect(decideHaul(creepAt(pos(25, 22), 150), haul, towered, SPOT)).to.deep.equal({
            kind: ActionKind.Drop,
            resource: RESOURCE_ENERGY
        });
        // A healthy standing pile at the spot sends the hauler back to the tower tier.
        towered.dropped = [pile("feed", SPOT, 400)];
        expect(decideHaul(creepAt(pos(25, 25), 150), haul, towered, SPOT)).to.deep.equal({
            kind: ActionKind.Transfer,
            targetId: "tow1",
            resource: RESOURCE_ENERGY
        });
    });
});

describe("upgrade executor with a controller container", () => {
    const withCtrlContainer = (energy: number, hits = 250000): RoomSnapshot =>
        roomWith({ structures: { ...roomWith().structures, [STRUCTURE_CONTAINER]: [container("ctrlCont", SPOT, energy, hits)] } });

    it("withdraws from the container before pile-scanning", () => {
        expect(decideUpgrade(creepAt(pos(25, 22), 0), upgrade, withCtrlContainer(500), SPOT)).to.deep.equal({
            kind: ActionKind.Withdraw,
            targetId: "ctrlCont",
            resource: RESOURCE_ENERGY
        });
        expect(decideUpgrade(creepAt(pos(25, 22), 0), upgrade, withCtrlContainer(0), SPOT).kind).to.equal(ActionKind.Idle);
    });

    it("repairs the container below the floor while carrying", () => {
        expect(decideUpgrade(creepAt(pos(25, 22), 50), upgrade, withCtrlContainer(500, 90000), SPOT)).to.deep.equal({
            kind: ActionKind.Repair,
            targetId: "ctrlCont"
        });
        expect(decideUpgrade(creepAt(pos(25, 20), 50), upgrade, withCtrlContainer(500), SPOT)).to.deep.equal({
            kind: ActionKind.Upgrade,
            targetId: "ctrl"
        });
    });
});

describe("build executor", () => {
    const seat = pos(11, 40);
    const roomWithSites = (sites: ConstructionSiteView[], extra: Partial<RoomSnapshot> = {}): RoomSnapshot =>
        roomWith({ myConstructionSites: sites, ...extra });

    it("refills from source containers, never the controller container", () => {
        const sites = [site("s1", STRUCTURE_EXTENSION, pos(23, 23), 0, 3000)];
        const room = roomWithSites(sites, {
            structures: {
                ...roomWith().structures,
                [STRUCTURE_CONTAINER]: [container("srcCont", seat, 800), container("ctrlCont", SPOT, 2000)]
            }
        });
        expect(decideBuild(creepAt(pos(12, 40), 0), build, room, SPOT)).to.deep.equal({
            kind: ActionKind.Withdraw,
            targetId: "srcCont",
            resource: RESOURCE_ENERGY
        });
        // Only the controller container has energy → pile fallback, else idle.
        const dry = roomWithSites(sites, {
            structures: { ...roomWith().structures, [STRUCTURE_CONTAINER]: [container("ctrlCont", SPOT, 2000)] }
        });
        expect(decideBuild(creepAt(pos(25, 20), 0), build, dry, SPOT).kind).to.equal(ActionKind.Idle);
    });

    it("refills from the nearest pile, not the biggest", () => {
        const sites = [site("s1", STRUCTURE_EXTENSION, pos(23, 23), 0, 3000)];
        const room = roomWithSites(sites, {
            dropped: [pile("far-big", pos(10, 41), 900), pile("near-small", pos(24, 21), 60)]
        });
        expect(decideBuild(creepAt(pos(25, 22), 0), build, room, SPOT)).to.deep.equal({
            kind: ActionKind.Pickup,
            targetId: "near-small"
        });
    });

    it("focuses by priority, then remaining energy, then id — never raw progress", () => {
        const sites = [
            site("road1", STRUCTURE_ROAD, pos(20, 20), 250, 300), // 83% done but a road
            site("ext1", STRUCTURE_EXTENSION, pos(23, 23), 100, 3000),
            site("ext2", STRUCTURE_EXTENSION, pos(27, 23), 2900, 3000) // 100 remaining — the focus
        ];
        expect(decideBuild(creepAt(pos(25, 24), 50), build, roomWithSites(sites), SPOT)).to.deep.equal({
            kind: ActionKind.Build,
            targetId: "ext2"
        });
        expect(decideBuild(creepAt(pos(40, 40), 50), build, roomWithSites(sites), SPOT)).to.deep.equal({
            kind: ActionKind.MoveTo,
            pos: pos(27, 23),
            range: 3
        });
    });

    it("acts as an upgrader when no sites exist", () => {
        expect(decideBuild(creepAt(pos(25, 20), 50), build, roomWith(), SPOT)).to.deep.equal({
            kind: ActionKind.Upgrade,
            targetId: "ctrl"
        });
    });

    it("repairs emergency fortifications before the focus site, then fortifies, then upgrades", () => {
        const fresh: FortifyTarget = { id: "ram1" as Id<AnyStructure>, pos: pos(24, 24), hits: 1, targetHits: 10000 };
        const healthy: FortifyTarget = { id: "ram2" as Id<AnyStructure>, pos: pos(26, 24), hits: 8000, targetHits: 10000 };
        const sites = [site("s1", STRUCTURE_EXTENSION, pos(23, 23), 0, 3000)];
        // Emergency (1 hit) outranks the site.
        expect(decideBuild(creepAt(pos(25, 24), 50), build, roomWithSites(sites), SPOT, [fresh])).to.deep.equal({
            kind: ActionKind.Repair,
            targetId: "ram1"
        });
        // Above the emergency floor: the site wins.
        expect(decideBuild(creepAt(pos(25, 24), 50), build, roomWithSites(sites), SPOT, [healthy])).to.deep.equal({
            kind: ActionKind.Build,
            targetId: "s1"
        });
        // No sites: fortify the neediest target.
        expect(decideBuild(creepAt(pos(25, 24), 50), build, roomWith(), SPOT, [healthy])).to.deep.equal({
            kind: ActionKind.Repair,
            targetId: "ram2"
        });
    });
});

describe("defend executor", () => {
    const defend: DefendAssignment = { kind: AssignmentKind.Defend, room: "W1N1" };
    const armed = (id: string, p: Pos): HostileView => ({
        id: id as Id<Creep>,
        pos: p,
        owner: "Raiders",
        hits: 500,
        bodyCounts: { [ATTACK]: 2, [MOVE]: 2 }
    });

    it("pursues and attacks the nearest armed hostile", () => {
        const room = roomWith({ hostiles: [armed("far", pos(5, 5)), armed("near", pos(26, 26))] });
        expect(decideDefend(creepAt(pos(25, 25), 0), defend, room)).to.deep.equal({
            kind: ActionKind.Attack,
            targetId: "near"
        });
        expect(decideDefend(creepAt(pos(40, 40), 0), defend, room)).to.deep.equal({
            kind: ActionKind.MoveTo,
            pos: pos(26, 26),
            range: 1
        });
    });

    it("ignores unarmed hostiles and parks at the spawn when quiet", () => {
        const scoutOnly = roomWith({
            hostiles: [{ id: "s1" as Id<Creep>, pos: pos(10, 10), owner: "Raiders", hits: 100, bodyCounts: { [MOVE]: 1 } }]
        });
        expect(decideDefend(creepAt(pos(40, 40), 0), defend, scoutOnly)).to.deep.equal({
            kind: ActionKind.MoveTo,
            pos: pos(25, 25),
            range: 2
        });
        expect(decideDefend(creepAt(pos(25, 24), 0), defend, scoutOnly).kind).to.equal(ActionKind.Idle);
    });
});

describe("haul executor at war and with storage", () => {
    it("promotes towers ahead of spawn while hostiles are present", () => {
        const war = roomWith({
            hostiles: [{ id: "r1" as Id<Creep>, pos: pos(10, 10), owner: "Raiders", hits: 500, bodyCounts: { [ATTACK]: 2 } }]
        });
        war.structures[STRUCTURE_TOWER] = [
            {
                id: "tow1" as Id<AnyStructure>,
                type: STRUCTURE_TOWER,
                pos: pos(24, 26),
                hits: 3000,
                hitsMax: 3000,
                store: { free: 500, used: 500, byResource: { energy: 500 } }
            }
        ];
        // Spawn has free capacity — peacetime order would pick it; war picks the tower.
        expect(decideHaul(creepAt(pos(24, 25), 150), haul, war, SPOT)).to.deep.equal({
            kind: ActionKind.Transfer,
            targetId: "tow1",
            resource: RESOURCE_ENERGY
        });
    });

    it("withdraws from storage only while spawn-side needs energy, deposits when full", () => {
        const stored = roomWith();
        stored.structures[STRUCTURE_STORAGE] = [
            {
                id: "stor1" as Id<AnyStructure>,
                type: STRUCTURE_STORAGE,
                pos: pos(25, 27),
                hits: 10000,
                hitsMax: 10000,
                store: { free: 400000, used: 500000, byResource: { energy: 500000 } }
            }
        ];
        // Empty hauler, spawn has free capacity, no piles/containers → storage run.
        expect(decideHaul(creepAt(pos(25, 26), 0), haul, stored, SPOT)).to.deep.equal({
            kind: ActionKind.Withdraw,
            targetId: "stor1",
            resource: RESOURCE_ENERGY
        });
        // Spawn-side full → no withdraw (step-off/idle instead)…
        stored.structures[STRUCTURE_SPAWN]![0].store = { free: 0, used: 300, byResource: { energy: 300 } };
        expect(decideHaul(creepAt(pos(25, 26), 0), haul, stored, SPOT).kind).to.equal(ActionKind.Idle);
        // …and a carrying hauler with a fed controller deposits INTO storage before dropping.
        stored.structures[STRUCTURE_CONTAINER] = [container("ctrlCont", SPOT, 2000)]; // feed full
        expect(decideHaul(creepAt(pos(25, 26), 150), haul, stored, SPOT)).to.deep.equal({
            kind: ActionKind.Transfer,
            targetId: "stor1",
            resource: RESOURCE_ENERGY
        });
    });
});

describe("pioneer executor", () => {
    const pioneer: PioneerAssignment = { kind: AssignmentKind.Pioneer, room: "W1N1" };
    // 200 capacity: 4 CARRY, like the real body.
    const carrying = (used: number): CreepView => ({ ...creepAt(pos(11, 40), 0), store: { free: 200 - used, used, byResource: used > 0 ? { energy: used } : {} } });

    it("fills at the source before spending — position closes the loop, not memory", () => {
        const room = roomWith();
        // Adjacent and partially loaded: KEEP harvesting (the "empty → collect"
        // rule every other executor uses would leave with 4 energy).
        expect(decidePioneer(carrying(50), pioneer, room)).to.deep.equal({
            kind: ActionKind.Harvest,
            targetId: "srcA"
        });
        // Empty and away: go get some.
        expect(decidePioneer(creepAt(pos(25, 25), 0), pioneer, room)).to.deep.equal({
            kind: ActionKind.MoveTo,
            pos: pos(10, 40),
            range: 1
        });
    });

    it("builds the spawn site first, then upgrades when there is nothing to build", () => {
        const withSite = roomWith({
            myConstructionSites: [
                site("road1", STRUCTURE_ROAD, pos(20, 20), 0, 300),
                site("spawnSite", STRUCTURE_SPAWN, pos(25, 25), 0, 15000)
            ]
        });
        const loaded = { ...carrying(200), pos: pos(25, 24) };
        expect(decidePioneer(loaded, pioneer, withSite)).to.deep.equal({
            kind: ActionKind.Build,
            targetId: "spawnSite"
        });
        // No sites: upgrade — at RCL1 that is what keeps the claim from expiring.
        const noSites = { ...carrying(200), pos: pos(25, 20) };
        expect(decidePioneer(noSites, pioneer, roomWith())).to.deep.equal({
            kind: ActionKind.Upgrade,
            targetId: "ctrl"
        });
    });
});
