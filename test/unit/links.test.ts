import { expect } from "../helpers/chai";
import { Pos, RoomSnapshot, StructureView } from "shared/views";
import { deriveLinkRoles, planLinkTransfers } from "economy/links";

function pos(x: number, y: number): Pos {
    return { x, y, roomName: "W1N1" };
}

function link(id: string, p: Pos, energy: number, cooldown = 0): StructureView {
    return {
        id: id as Id<AnyStructure>,
        type: STRUCTURE_LINK,
        pos: p,
        hits: 1000,
        hitsMax: 1000,
        cooldown,
        store: { free: 800 - energy, used: energy, byResource: energy > 0 ? { energy } : {} }
    };
}

const SPOT = pos(23, 17);

function room(links: StructureView[]): RoomSnapshot {
    return {
        name: "W1N1",
        my: true,
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        sources: [{ id: "s1" as Id<Source>, pos: pos(10, 40), energy: 3000, energyCapacity: 3000 }],
        structures: {
            [STRUCTURE_LINK]: links,
            [STRUCTURE_STORAGE]: [
                {
                    id: "stor" as Id<AnyStructure>,
                    type: STRUCTURE_STORAGE,
                    pos: pos(25, 27),
                    hits: 10000,
                    hitsMax: 10000,
                    store: { free: 900000, used: 100000, byResource: { energy: 100000 } }
                }
            ]
        },
        myConstructionSites: [],
        hostiles: [],
        dropped: []
    } as unknown as RoomSnapshot;
}

describe("links", () => {
    const srcLink = (): StructureView => link("Lsrc", pos(12, 38), 500);
    const ctrlLink = (energy = 100): StructureView => link("Lctrl", pos(22, 18), energy);
    const hubLink = (): StructureView => link("Lhub", pos(24, 26), 0);

    it("derives roles geometrically, never from order", () => {
        const roles = deriveLinkRoles(room([hubLink(), ctrlLink(), srcLink()]), SPOT);
        expect(roles.sources.map(l => l.id)).to.deep.equal(["Lsrc"]);
        expect(roles.controller?.id).to.equal("Lctrl");
        expect(roles.hub?.id).to.equal("Lhub");
        // An orphan link matches nothing and is ignored.
        const withOrphan = deriveLinkRoles(room([link("Lorphan", pos(40, 10), 800), srcLink()]), SPOT);
        expect(withOrphan.sources.map(l => l.id)).to.deep.equal(["Lsrc"]);
    });

    it("sends from ready source links to the controller side, else the hub", () => {
        const transfers = planLinkTransfers(room([srcLink(), ctrlLink(), hubLink()]), SPOT);
        expect(transfers).to.deep.equal([{ fromId: "Lsrc", toId: "Lctrl" }]);
        // Controller link full → the hub takes it.
        const full = planLinkTransfers(room([srcLink(), ctrlLink(800), hubLink()]), SPOT);
        expect(full).to.deep.equal([{ fromId: "Lsrc", toId: "Lhub" }]);
    });

    it("respects threshold and cooldown", () => {
        expect(planLinkTransfers(room([link("Lsrc", pos(12, 38), 300), ctrlLink()]), SPOT)).to.have.length(0);
        expect(planLinkTransfers(room([link("Lsrc", pos(12, 38), 500, 5), ctrlLink()]), SPOT)).to.have.length(0);
    });
});
