import { expect } from "../helpers/chai";
import { makeCreep, makePos, makeStore } from "../helpers/mock";
import {
    EnergySourceKind,
    pickBuildSite,
    pickEnergySink,
    pickEnergySource,
    resolveEnergySink,
    resolveEnergySource
} from "actions/logistics";
import { LogisticsLedger } from "actions/ledger";
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

function pile(amount: number, x: number, y: number, id = `pile_${x}_${y}`): unknown {
    return { id, amount, resourceType: RESOURCE_ENERGY, pos: makePos(x, y) };
}
function store(used: number, capacity: number, x: number, y: number, id = `store_${x}_${y}`): unknown {
    return { id, store: makeStore(used, capacity), pos: makePos(x, y) };
}
function sink(type: string, used: number, capacity: number, x: number, y: number, id = `sink_${x}_${y}`): unknown {
    return { id, structureType: type, store: makeStore(used, capacity), pos: makePos(x, y) };
}
function site(type: string, progress: number, progressTotal: number, x: number, y: number): unknown {
    return { structureType: type, progress, progressTotal, pos: makePos(x, y) };
}

/** A gatherer with `free` carry space, standing at room center. */
const gatherer = (free = 250): Creep => makeCreep({ pos: makePos(25, 25), store: makeStore(0, free) });
/** A loaded carrier with `load` energy, standing at room center. */
const carrier = (load = 50): Creep => makeCreep({ pos: makePos(25, 25), store: makeStore(load, load) });
const empty = (): LogisticsLedger => new LogisticsLedger();

describe("pickEnergySource", () => {
    it("prefers a near container over a far dropped pile", () => {
        const container = store(2000, 2000, 27, 25); // range 2
        const r = room({ containers: [container], droppedEnergy: [pile(500, 45, 25)] });
        const result = pickEnergySource(gatherer(), r, empty());
        expect(result?.kind).to.equal(EnergySourceKind.Withdraw);
        expect(result?.target).to.equal(container);
    });

    it("prefers a near dropped pile over a far container", () => {
        const p = pile(500, 26, 25); // range 1
        const r = room({ containers: [store(2000, 2000, 40, 25)], droppedEnergy: [p] });
        const result = pickEnergySource(gatherer(), r, empty());
        expect(result?.kind).to.equal(EnergySourceKind.Pickup);
        expect(result?.target).to.equal(p);
    });

    it("prefers a fuller far source over a tiny near one (amount dominates distance)", () => {
        const tiny = pile(20, 26, 25); // range 1, almost nothing
        const big = pile(1000, 30, 25); // range 5, a real stash
        const result = pickEnergySource(gatherer(250), room({ droppedEnergy: [tiny, big] }), empty());
        expect(result?.target).to.equal(big);
    });

    it("routes around a source already reserved by other creeps", () => {
        const near = pile(250, 26, 25); // range 1, fully claimable by one creep
        const far = pile(1000, 30, 25); // range 5
        const r = room({ droppedEnergy: [near, far] });

        // With nothing reserved, the near source (it can fill the creep) wins.
        expect(pickEnergySource(gatherer(250), r, empty())?.target).to.equal(near);

        // Once another creep has claimed the near pile's whole 250, it has no
        // deliverable energy left, so the next creep takes the far stash.
        const ledger = empty();
        ledger.claim((near as { id: string }).id, 250);
        expect(pickEnergySource(gatherer(250), r, ledger)?.target).to.equal(far);
    });

    it("excludes storage when allowStorage is false", () => {
        const r = room({ storage: store(50000, 100000, 26, 25) });
        expect(pickEnergySource(gatherer(), r, empty(), { allowStorage: false })).to.equal(undefined);
    });

    it("draws from storage as a last resort when allowed", () => {
        const storage = store(50000, 100000, 26, 25);
        const result = pickEnergySource(gatherer(), room({ storage }), empty(), { allowStorage: true });
        expect(result?.kind).to.equal(EnergySourceKind.Withdraw);
        expect(result?.target).to.equal(storage);
    });
});

describe("pickEnergySink", () => {
    it("refills an empty spawn over a nearer half-full extension", () => {
        const spawn = sink(STRUCTURE_SPAWN, 0, 300, 35, 25); // range 10, empty
        const ext = sink(STRUCTURE_EXTENSION, 25, 50, 26, 25); // range 1, half full
        const result = pickEnergySink(carrier(), room({ energySinks: () => [ext, spawn] }), empty());
        expect(result).to.equal(spawn);
    });

    it("prioritizes a depleted tower over everything while under attack", () => {
        const tower = sink(STRUCTURE_TOWER, 0, 1000, 40, 25); // range 15, empty, far
        const spawn = sink(STRUCTURE_SPAWN, 0, 300, 26, 25); // range 1, empty, near
        const result = pickEnergySink(carrier(), room({ energySinks: () => [spawn, tower], hostiles: [{}] }), empty());
        expect(result).to.equal(tower);
    });

    it("does not let a far tower dominate in peacetime", () => {
        const tower = sink(STRUCTURE_TOWER, 0, 1000, 40, 25); // range 15, empty, far
        const spawn = sink(STRUCTURE_SPAWN, 0, 300, 26, 25); // range 1, empty, near
        const result = pickEnergySink(carrier(), room({ energySinks: () => [spawn, tower], hostiles: [] }), empty());
        expect(result).to.equal(spawn);
    });

    it("spreads deliveries — a reserved sink is skipped for the next one", () => {
        const a = sink(STRUCTURE_EXTENSION, 0, 50, 26, 25); // range 1
        const b = sink(STRUCTURE_EXTENSION, 0, 50, 27, 25); // range 2
        const r = room({ energySinks: () => [a, b] });

        // Empty ledger: the nearer extension wins.
        expect(pickEnergySink(carrier(50), r, empty())).to.equal(a);

        // Reserve all of A's free space: the next carrier delivers to B instead.
        const ledger = empty();
        ledger.claim((a as { id: string }).id, 50);
        expect(pickEnergySink(carrier(50), r, ledger)).to.equal(b);
    });
});

describe("resolveEnergySource (sticky)", () => {
    it("keeps a held source while it still has energy, ignoring a better one", () => {
        const held = pile(300, 40, 25, "held"); // far, but committed
        const better = pile(300, 26, 25, "better"); // nearer
        const creep = makeCreep({ pos: makePos(25, 25), store: makeStore(0, 250), memory: { srcTargetId: "held" } });
        const result = resolveEnergySource(creep, room({ droppedEnergy: [held, better] }), empty());
        expect(result?.target).to.equal(held);
        expect(creep.memory.srcTargetId).to.equal("held");
    });

    it("drops a vanished held source and re-picks, recording the new target", () => {
        const fresh = pile(300, 26, 25, "fresh");
        const creep = makeCreep({ pos: makePos(25, 25), store: makeStore(0, 250), memory: { srcTargetId: "gone" } });
        const result = resolveEnergySource(creep, room({ droppedEnergy: [fresh] }), empty());
        expect(result?.target).to.equal(fresh);
        expect(creep.memory.srcTargetId).to.equal("fresh");
    });

    it("coordinates two creeps onto different sources via the shared ledger", () => {
        const near = pile(250, 26, 25, "near"); // one creep can drain it
        const far = pile(1000, 30, 25, "far");
        const r = room({ droppedEnergy: [near, far] });
        const ledger = empty();

        const a = makeCreep({ pos: makePos(25, 25), store: makeStore(0, 250), memory: {} });
        const b = makeCreep({ pos: makePos(25, 25), store: makeStore(0, 250), memory: {} });

        const ra = resolveEnergySource(a, r, ledger);
        const rb = resolveEnergySource(b, r, ledger);

        expect(ra?.target).to.equal(near);
        expect(rb?.target).to.equal(far); // a's claim emptied near, so b routes onward
        expect(a.memory.srcTargetId).to.equal("near");
        expect(b.memory.srcTargetId).to.equal("far");
    });
});

describe("resolveEnergySink (sticky)", () => {
    it("keeps a held sink while it has space, and claims when re-picking", () => {
        const held = sink(STRUCTURE_EXTENSION, 0, 50, 40, 25, "held");
        const nearer = sink(STRUCTURE_SPAWN, 0, 300, 26, 25, "nearer");
        const creep = makeCreep({ pos: makePos(25, 25), store: makeStore(50, 50), memory: { sinkTargetId: "held" } });
        const result = resolveEnergySink(creep, room({ energySinks: () => [held, nearer] }), empty());
        expect(result).to.equal(held);

        const fresh = makeCreep({ pos: makePos(25, 25), store: makeStore(50, 50), memory: {} });
        const ledger = empty();
        const picked = resolveEnergySink(fresh, room({ energySinks: () => [nearer] }), ledger);
        expect(picked).to.equal(nearer);
        expect(fresh.memory.sinkTargetId).to.equal("nearer");
    });
});

describe("pickBuildSite", () => {
    it("builds a high-value structure before a nearer road", () => {
        const tower = site(STRUCTURE_TOWER, 0, 5000, 45, 25); // far
        const road = site(STRUCTURE_ROAD, 4000, 5000, 26, 25); // near, near-complete
        const result = pickBuildSite(gatherer(), room({ constructionSites: [road, tower] }));
        expect(result).to.equal(tower);
    });

    it("breaks ties between same-type sites by proximity", () => {
        const near = site(STRUCTURE_EXTENSION, 0, 3000, 27, 25); // range 2
        const far = site(STRUCTURE_EXTENSION, 0, 3000, 45, 25); // range 20
        const result = pickBuildSite(gatherer(), room({ constructionSites: [far, near] }));
        expect(result).to.equal(near);
    });
});
