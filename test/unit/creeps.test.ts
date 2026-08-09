import { expect } from "../helpers/chai";
import { AssignmentKind, HaulAssignment, MineAssignment, UpgradeAssignment } from "shared/assignments";
import { CreepView, DroppedView, Pos, RoomSnapshot } from "shared/views";
import { ActionKind } from "creeps/actions";
import { decideHaul, decideMine, decideUpgrade } from "creeps/executors";

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
const SPOT = pos(25, 21);

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
