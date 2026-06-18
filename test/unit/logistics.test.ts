import { expect } from "../helpers/chai";
import { makeCreep, makePos, makeStore } from "../helpers/mock";
import { EnergySourceKind, pickBuildSite, pickEnergySink, pickEnergySource } from "actions/logistics";
import { WorldRoom } from "world/WorldRoom";

// Duck-typed WorldRoom: the logistics functions only read these fields.
function room(props: Record<string, unknown>): WorldRoom {
    return {
        droppedEnergy: [],
        containers: [],
        storage: undefined,
        hostiles: [],
        constructionSites: [],
        energySinks: () => [],
        ...props
    } as unknown as WorldRoom;
}

function pile(amount: number, x: number, y: number): unknown {
    return { amount, pos: makePos(x, y) };
}
function store(used: number, capacity: number, x: number, y: number): unknown {
    return { store: makeStore(used, capacity), pos: makePos(x, y) };
}
function sink(type: string, used: number, capacity: number, x: number, y: number): unknown {
    return { structureType: type, store: makeStore(used, capacity), pos: makePos(x, y) };
}
function site(type: string, progress: number, progressTotal: number, x: number, y: number): unknown {
    return { structureType: type, progress, progressTotal, pos: makePos(x, y) };
}

const creep = (): Creep => makeCreep({ pos: makePos(25, 25) });

describe("pickEnergySource", () => {
    it("prefers a near container over a far dropped pile", () => {
        const container = store(2000, 2000, 27, 25); // range 2
        const result = pickEnergySource(creep(), room({ containers: [container], droppedEnergy: [pile(500, 45, 25)] }));
        expect(result?.kind).to.equal(EnergySourceKind.Withdraw);
        expect(result?.target).to.equal(container);
    });

    it("prefers a near dropped pile over a far container", () => {
        const p = pile(500, 26, 25); // range 1
        const result = pickEnergySource(creep(), room({ containers: [store(2000, 2000, 40, 25)], droppedEnergy: [p] }));
        expect(result?.kind).to.equal(EnergySourceKind.Pickup);
        expect(result?.target).to.equal(p);
    });

    it("excludes storage when allowStorage is false", () => {
        const r = room({ storage: store(50000, 100000, 26, 25) });
        expect(pickEnergySource(creep(), r, { allowStorage: false })).to.equal(undefined);
    });

    it("draws from storage as a last resort when allowed", () => {
        const storage = store(50000, 100000, 26, 25);
        const result = pickEnergySource(creep(), room({ storage }), { allowStorage: true });
        expect(result?.kind).to.equal(EnergySourceKind.Withdraw);
        expect(result?.target).to.equal(storage);
    });
});

describe("pickEnergySink", () => {
    it("refills an empty spawn over a nearer half-full extension", () => {
        const spawn = sink(STRUCTURE_SPAWN, 0, 300, 35, 25); // range 10, empty
        const ext = sink(STRUCTURE_EXTENSION, 25, 50, 26, 25); // range 1, half full
        const result = pickEnergySink(creep(), room({ energySinks: () => [ext, spawn] }));
        expect(result).to.equal(spawn);
    });

    it("prioritizes a depleted tower over everything while under attack", () => {
        const tower = sink(STRUCTURE_TOWER, 0, 1000, 40, 25); // range 15, empty, far
        const spawn = sink(STRUCTURE_SPAWN, 0, 300, 26, 25); // range 1, empty, near
        const result = pickEnergySink(creep(), room({ energySinks: () => [spawn, tower], hostiles: [{}] }));
        expect(result).to.equal(tower);
    });

    it("does not let a far tower dominate in peacetime", () => {
        const tower = sink(STRUCTURE_TOWER, 0, 1000, 40, 25); // range 15, empty, far
        const spawn = sink(STRUCTURE_SPAWN, 0, 300, 26, 25); // range 1, empty, near
        const result = pickEnergySink(creep(), room({ energySinks: () => [spawn, tower], hostiles: [] }));
        expect(result).to.equal(spawn);
    });
});

describe("pickBuildSite", () => {
    it("builds a high-value structure before a nearer road", () => {
        const tower = site(STRUCTURE_TOWER, 0, 5000, 45, 25); // far
        const road = site(STRUCTURE_ROAD, 4000, 5000, 26, 25); // near, near-complete
        const result = pickBuildSite(creep(), room({ constructionSites: [road, tower] }));
        expect(result).to.equal(tower);
    });

    it("breaks ties between same-type sites by proximity", () => {
        const near = site(STRUCTURE_EXTENSION, 0, 3000, 27, 25); // range 2
        const far = site(STRUCTURE_EXTENSION, 0, 3000, 45, 25); // range 20
        const result = pickBuildSite(creep(), room({ constructionSites: [far, near] }));
        expect(result).to.equal(near);
    });
});
