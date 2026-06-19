import { expect } from "../helpers/chai";
import { buildLedger, LogisticsLedger } from "actions/ledger";
import { makeCreep, makeStore } from "../helpers/mock";
import { World } from "world/World";

/** Install a Game.getObjectById backed by a fixed id→object map for one test. */
function withObjects(objects: Record<string, unknown>): void {
    (Game as unknown as { getObjectById: (id: string) => unknown }).getObjectById = (id: string) =>
        objects[id] ?? null;
}

function world(creeps: Creep[]): World {
    return { creeps } as unknown as World;
}

describe("LogisticsLedger", () => {
    it("accumulates claims and reports reserved amounts", () => {
        const ledger = new LogisticsLedger();
        expect(ledger.reserved("a")).to.equal(0);
        ledger.claim("a", 30);
        ledger.claim("a", 20);
        expect(ledger.reserved("a")).to.equal(50);
        expect(ledger.reserved(undefined)).to.equal(0);
    });

    it("ignores non-positive claims", () => {
        const ledger = new LogisticsLedger();
        ledger.claim("a", 0);
        ledger.claim("a", -10);
        expect(ledger.reserved("a")).to.equal(0);
    });
});

describe("buildLedger", () => {
    it("reserves a gatherer's free capacity on its source, capped by availability", () => {
        withObjects({ pile1: { amount: 500, resourceType: RESOURCE_ENERGY } });
        const c = makeCreep({ store: makeStore(0, 200), memory: { working: false, srcTargetId: "pile1" } });
        expect(buildLedger(world([c])).reserved("pile1")).to.equal(200); // min(200 free, 500 avail)
    });

    it("caps the claim at what the source actually has", () => {
        withObjects({ pile1: { amount: 80, resourceType: RESOURCE_ENERGY } });
        const c = makeCreep({ store: makeStore(0, 200), memory: { working: false, srcTargetId: "pile1" } });
        expect(buildLedger(world([c])).reserved("pile1")).to.equal(80); // min(200 free, 80 avail)
    });

    it("reserves a deliverer's carried energy on its sink, capped by free space", () => {
        withObjects({ ext1: { store: makeStore(25, 50) } }); // 25 free
        const c = makeCreep({ store: makeStore(50, 50), memory: { working: true, sinkTargetId: "ext1" } });
        expect(buildLedger(world([c])).reserved("ext1")).to.equal(25); // min(50 load, 25 free)
    });

    it("reads the source target when gathering and the sink target when delivering", () => {
        withObjects({ src: { amount: 999, resourceType: RESOURCE_ENERGY }, sink: { store: makeStore(0, 50) } });
        // working=false → look at srcTargetId; a stale sinkTargetId is ignored.
        const c = makeCreep({ store: makeStore(0, 100), memory: { working: false, srcTargetId: "src", sinkTargetId: "sink" } });
        const ledger = buildLedger(world([c]));
        expect(ledger.reserved("src")).to.equal(100);
        expect(ledger.reserved("sink")).to.equal(0);
    });

    it("ignores creeps whose target object no longer exists", () => {
        withObjects({});
        const c = makeCreep({ store: makeStore(0, 200), memory: { working: false, srcTargetId: "gone" } });
        expect(buildLedger(world([c])).reserved("gone")).to.equal(0);
    });

    it("ignores spawning creeps and those with no target", () => {
        withObjects({ pile1: { amount: 500, resourceType: RESOURCE_ENERGY } });
        const spawning = makeCreep({ spawning: true, store: makeStore(0, 200), memory: { working: false, srcTargetId: "pile1" } });
        const untargeted = makeCreep({ store: makeStore(0, 200), memory: { working: false } });
        expect(buildLedger(world([spawning, untargeted])).reserved("pile1")).to.equal(0);
    });
});
