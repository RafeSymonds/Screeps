import { expect } from "../helpers/chai";
import { RoomSnapshot, StructureView } from "shared/views";
import { computeRepairTargets, isCriticalRepair, REPAIR_CONFIG } from "economy/repair";

function struct(id: string, type: StructureConstant, hits: number, hitsMax: number): StructureView {
    return { id: id as Id<AnyStructure>, type, pos: { x: 25, y: 25, roomName: "W1N1" }, hits, hitsMax };
}

function room(structures: Partial<Record<StructureConstant, StructureView[]>>): RoomSnapshot {
    return {
        name: "W1N1",
        my: true,
        energyAvailable: 300,
        energyCapacityAvailable: 300,
        sources: [],
        structures,
        myConstructionSites: [],
        hostiles: [],
        dropped: []
    };
}

describe("maintenance repair", () => {
    it("picks up decayed roads and containers before they vanish", () => {
        // Roads and containers decay on a timer whether or not anyone touches them.
        // Letting them break means paying full construction cost to replace what a
        // few repair ticks would have kept.
        const targets = computeRepairTargets(
            room({
                [STRUCTURE_ROAD]: [struct("road", STRUCTURE_ROAD, 1000, 5000)],
                [STRUCTURE_CONTAINER]: [struct("cont", STRUCTURE_CONTAINER, 100_000, 250_000)]
            })
        );
        expect(targets.map(t => t.id)).to.have.members(["road", "cont"]);
    });

    it("leaves healthy structures alone", () => {
        const targets = computeRepairTargets(
            room({ [STRUCTURE_ROAD]: [struct("fine", STRUCTURE_ROAD, 4900, 5000)] })
        );
        expect(targets).to.have.length(0);
    });

    it("NEVER touches ramparts or walls — fortify owns those", () => {
        // Their hitsMax is 300 million, so any fraction-of-max rule fires forever
        // and would consume the whole workforce. defense/fortify.ts judges them
        // against an absolute RCL-scaled target instead.
        const targets = computeRepairTargets(
            room({
                [STRUCTURE_RAMPART]: [struct("ramp", STRUCTURE_RAMPART, 1, 300_000_000)],
                [STRUCTURE_WALL]: [struct("wall", STRUCTURE_WALL, 1, 300_000_000)]
            })
        );
        expect(targets).to.have.length(0);
    });

    it("orders by fraction remaining, not absolute hits", () => {
        // A road at 10% is closer to vanishing than a container at 40%, even though
        // the container is missing far more hits in absolute terms.
        const targets = computeRepairTargets(
            room({
                [STRUCTURE_ROAD]: [struct("road", STRUCTURE_ROAD, 500, 5000)],
                [STRUCTURE_CONTAINER]: [struct("cont", STRUCTURE_CONTAINER, 100_000, 250_000)]
            })
        );
        expect(targets[0].id).to.equal("road");
    });

    it("bounds the list so a battered room cannot monopolise the workforce", () => {
        const roads = Array.from({ length: 20 }, (_, i) => struct(`r${i}`, STRUCTURE_ROAD, 100, 5000));
        expect(computeRepairTargets(room({ [STRUCTURE_ROAD]: roads }))).to.have.length(REPAIR_CONFIG.maxTargets);
    });

    it("flags near-death structures as critical, which outranks new construction", () => {
        expect(isCriticalRepair({ id: "a" as Id<AnyStructure>, pos: { x: 1, y: 1, roomName: "W1N1" }, hits: 100, hitsMax: 5000 })).to.equal(true);
        expect(isCriticalRepair({ id: "b" as Id<AnyStructure>, pos: { x: 1, y: 1, roomName: "W1N1" }, hits: 3000, hitsMax: 5000 })).to.equal(false);
    });
});
