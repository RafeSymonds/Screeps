import sinon from "sinon";
import { expect } from "../helpers/chai";
import { makeCreep, makePos, makeRoom, makeStore, makeStructure } from "../helpers/mock";
import { buildSnapshot } from "snapshot/index";
import { _clearTerrainCacheForTest, getTerrain } from "snapshot/terrain";

function g(): Record<string, any> {
    return global as unknown as Record<string, any>;
}

function installRoom(room: Room): void {
    g().Game.rooms[(room as { name: string }).name] = room;
}

describe("snapshot", () => {
    it("builds plain views with the expected shapes", () => {
        const room = makeRoom({
            name: "W1N1",
            sources: [{ id: "src1", pos: makePos(5, 5), energy: 1200, energyCapacity: 3000 }],
            minerals: [{ id: "min1", pos: makePos(40, 40), mineralType: "H", mineralAmount: 5000 }],
            structures: [
                makeStructure(STRUCTURE_SPAWN, { store: makeStore(300, 300) }),
                makeStructure(STRUCTURE_EXTENSION),
                makeStructure(STRUCTURE_EXTENSION)
            ],
            sites: [{ id: "site1", pos: makePos(11, 11), structureType: STRUCTURE_EXTENSION, progress: 10, progressTotal: 3000 }],
            hostiles: [makeCreep({ name: "enemy", owner: "them", body: [ATTACK, MOVE] as BodyPartConstant[] })],
            dropped: [{ id: "res1", pos: makePos(9, 9), resourceType: RESOURCE_ENERGY, amount: 77 }],
            energyAvailable: 250,
            energyCapacityAvailable: 300
        });
        installRoom(room);
        g().Game.creeps.worker = makeCreep({
            name: "worker",
            body: [WORK, CARRY, MOVE, MOVE] as BodyPartConstant[],
            store: makeStore(30, 100),
            ticksToLive: 900
        });

        const snap = buildSnapshot();
        expect(snap.myRooms).to.have.length(1);
        const view = snap.myRooms[0];
        expect(view.name).to.equal("W1N1");
        expect(view.my).to.equal(true);
        expect(view.controller).to.deep.include({ level: 1, my: true, ticksToDowngrade: 20000 });
        expect(view.energyAvailable).to.equal(250);
        expect(view.sources[0]).to.deep.equal({
            id: "src1",
            pos: { x: 5, y: 5, roomName: "W1N1" },
            energy: 1200,
            energyCapacity: 3000
        });
        expect(view.mineral).to.deep.include({ id: "min1", type: "H", amount: 5000 });
        expect(view.structures[STRUCTURE_EXTENSION as StructureConstant]).to.have.length(2);
        expect(view.structures[STRUCTURE_SPAWN as StructureConstant]![0].store).to.deep.equal({
            free: 0,
            used: 300,
            byResource: { energy: 300 }
        });
        expect(view.myConstructionSites[0]).to.deep.include({ id: "site1", type: STRUCTURE_EXTENSION, progress: 10 });
        expect(view.hostiles[0]).to.deep.include({ owner: "them" });
        expect(view.hostiles[0].bodyCounts).to.deep.equal({ [ATTACK]: 1, [MOVE]: 1 });
        expect(view.dropped[0]).to.deep.include({ resource: RESOURCE_ENERGY, amount: 77 });

        const creep = snap.myCreeps.find(c => c.name === "worker")!;
        expect(creep.bodyCounts).to.deep.equal({ [WORK]: 1, [CARRY]: 1, [MOVE]: 2 });
        expect(creep.store.byResource).to.deep.equal({ energy: 30 });
        expect(creep.ticksToLive).to.equal(900);
        expect(creep.spawning).to.equal(false);
    });

    it("omits optional fields rather than setting undefined", () => {
        installRoom(makeRoom({ name: "W9N9", controller: null }));
        g().Game.creeps.baby = makeCreep({ name: "baby", spawning: true });
        const snap = buildSnapshot();
        expect(snap.myRooms).to.have.length(0); // controller-less room is not owned
        const visible = snap.room("W9N9")!;
        expect(Object.prototype.hasOwnProperty.call(visible, "controller")).to.equal(false);
        expect(Object.prototype.hasOwnProperty.call(visible, "mineral")).to.equal(false);
        const baby = snap.myCreeps.find(c => c.name === "baby")!;
        expect(Object.prototype.hasOwnProperty.call(baby, "ticksToLive")).to.equal(false);
        expect(baby.spawning).to.equal(true);
        expect(snap.room("nowhere")).to.equal(undefined); // not visible at all
    });

    it("calls each find constant at most once per owned room", () => {
        const room = makeRoom({ name: "W1N1" });
        const spy = sinon.spy(room, "find" as never);
        installRoom(room);
        const snap = buildSnapshot();
        expect(snap.myRooms).to.have.length(1);
        const constants = spy.getCalls().map(c => c.args[0]);
        expect(constants).to.have.length(new Set(constants).size);
        expect(constants).to.have.length(6);
    });

    it("builds non-owned visible rooms only on demand", () => {
        const neutral = makeRoom({ name: "W5N5", my: false, controller: null });
        const spy = sinon.spy(neutral, "find" as never);
        installRoom(neutral);
        const snap = buildSnapshot();
        expect(spy.callCount).to.equal(0);
        const view = snap.room("W5N5");
        expect(view).to.not.equal(undefined);
        expect(view!.my).to.equal(false);
        expect(spy.callCount).to.be.greaterThan(0);
        expect(snap.room("W5N5")).to.equal(view); // cached, identity-stable
        expect(spy.getCalls().map(c => c.args[0])).to.have.length(6);
    });

    it("is identity-stable within a tick and throws on stale access", () => {
        installRoom(makeRoom({ name: "W1N1" }));
        const snap = buildSnapshot();
        expect(snap.myRooms).to.equal(snap.myRooms);
        expect(snap.room("W1N1")).to.equal(snap.myRooms[0]);
        g().Game.time = 2;
        expect(() => snap.myRooms).to.throw(/stale snapshot/);
        expect(() => snap.room("W1N1")).to.throw(/stale snapshot/);
    });

    it("produces exactly JSON-round-trippable views (memory excepted)", () => {
        installRoom(
            makeRoom({
                name: "W1N1",
                structures: [makeStructure(STRUCTURE_SPAWN, { store: makeStore(100, 300) })],
                sources: [{ id: "s", pos: makePos(1, 1), energy: 0, energyCapacity: 3000 }]
            })
        );
        g().Game.creeps.worker = makeCreep({ name: "worker", spawning: true });
        const snap = buildSnapshot();

        const roomView = snap.myRooms[0];
        expect(JSON.parse(JSON.stringify(roomView))).to.deep.equal(roomView);

        const { memory, ...creepRest } = snap.myCreeps[0];
        expect(JSON.parse(JSON.stringify(creepRest))).to.deep.equal(creepRest);
    });

    it("copies terrain once and caches the grid across calls", () => {
        _clearTerrainCacheForTest();
        const get = sinon.stub().callsFake((x: number, y: number) => {
            if (x === 0 && y === 0) return TERRAIN_MASK_WALL;
            if (x === 1 && y === 0) return TERRAIN_MASK_SWAMP;
            return 0;
        });
        const terrainSpy = sinon.stub().returns({ get });
        g().Game.map.getRoomTerrain = terrainSpy;

        const grid = getTerrain("W1N1");
        expect(grid.isWall(0, 0)).to.equal(true);
        expect(grid.isSwamp(0, 0)).to.equal(false);
        expect(grid.isSwamp(1, 0)).to.equal(true);
        expect(grid.isWall(25, 25)).to.equal(false);

        getTerrain("W1N1");
        expect(terrainSpy.callCount).to.equal(1);
    });
});
