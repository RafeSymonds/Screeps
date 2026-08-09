import { expect } from "../helpers/chai";
import { Pos } from "shared/views";
import { TerrainGrid } from "snapshot/terrain";
import { BasePlan, chooseAnchor, LayoutInput, pack, planBase, unpack } from "layout/plan";

const open: TerrainGrid = { isWall: () => false, isSwamp: () => false };

function pos(x: number, y: number, roomName = "W1N1"): Pos {
    return { x, y, roomName };
}

/** The growth-scenario world: spawn (25,25), controller (25,15), sources south. */
function growthInput(overrides: Partial<LayoutInput> = {}): LayoutInput {
    return {
        roomName: "W1N1",
        terrain: open,
        controller: pos(25, 15),
        sources: [pos(10, 40), pos(40, 40)],
        mineral: pos(45, 5),
        structures: [{ type: STRUCTURE_SPAWN, pos: pos(25, 25) }],
        ...overrides
    };
}

function allPlacements(plan: BasePlan, except: StructureConstant[] = []): { type: string; p: Pos }[] {
    const out: { type: string; p: Pos }[] = [];
    for (const [type, positions] of Object.entries(plan.places)) {
        if (except.includes(type as StructureConstant)) continue;
        for (const p of positions ?? []) out.push({ type, p });
    }
    return out;
}

const cheb = (a: Pos, b: Pos): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe("layout planner", () => {
    it("fills exact RCL8 counts for capped types and stays in bounds, deduplicated", () => {
        const plan = planBase(growthInput())!;
        expect(plan.places[STRUCTURE_SPAWN]).to.have.length(3);
        expect(plan.places[STRUCTURE_EXTENSION]).to.have.length(60);
        expect(plan.places[STRUCTURE_TOWER]).to.have.length(6);
        expect(plan.places[STRUCTURE_LAB]).to.have.length(10);
        expect(plan.places[STRUCTURE_STORAGE]).to.have.length(1);
        expect(plan.places[STRUCTURE_TERMINAL]).to.have.length(1);
        expect(plan.places[STRUCTURE_FACTORY]).to.have.length(1);
        expect(plan.places[STRUCTURE_OBSERVER]).to.have.length(1);
        expect(plan.places[STRUCTURE_POWER_SPAWN]).to.have.length(1);
        expect(plan.places[STRUCTURE_NUKER]).to.have.length(1);
        expect(plan.places[STRUCTURE_EXTRACTOR]).to.deep.equal([pos(45, 5)]);
        expect(plan.places[STRUCTURE_LINK]).to.have.length(4); // hub + controller + 2 sources
        expect(plan.places[STRUCTURE_CONTAINER]).to.have.length(3);

        // Ramparts deliberately coincide with criticals; everything else is disjoint.
        const placements = allPlacements(plan, [STRUCTURE_RAMPART]);
        const keys = placements.map(({ p }) => pack(p.x, p.y));
        expect(new Set(keys).size).to.equal(keys.length);
        for (const { type, p } of placements) {
            const bound = type === STRUCTURE_CONTAINER || type === STRUCTURE_ROAD ? [1, 48] : [2, 47];
            if (type === STRUCTURE_EXTRACTOR) continue; // sits on the mineral wherever it is
            expect(p.x, `${type}@${p.x},${p.y}`).to.be.within(bound[0], bound[1]);
            expect(p.y, `${type}@${p.x},${p.y}`).to.be.within(bound[0], bound[1]);
        }
    });

    it("anchors on the existing spawn and heads places.spawn with it", () => {
        const plan = planBase(growthInput())!;
        expect(plan.anchor).to.deep.equal(pos(25, 25));
        expect(plan.places[STRUCTURE_SPAWN]![0]).to.deep.equal(pos(25, 25));
    });

    it("chooses a clearance-maximal anchor when no spawn exists", () => {
        const walledEdges: TerrainGrid = {
            isWall: (x, y) => x < 5 || y < 5 || x > 44 || y > 44,
            isSwamp: () => false
        };
        const anchor = chooseAnchor(growthInput({ terrain: walledEdges, structures: [] }))!;
        // Deep interior, far from the wall ring.
        expect(anchor.x).to.be.within(15, 34);
        expect(anchor.y).to.be.within(15, 34);
    });

    it("incorporates existing structures as array heads and never double-plans their tiles", () => {
        const existingExt = [pos(30, 30), pos(31, 31)];
        const plan = planBase(
            growthInput({
                structures: [
                    { type: STRUCTURE_SPAWN, pos: pos(25, 25) },
                    ...existingExt.map(p => ({ type: STRUCTURE_EXTENSION, pos: p }))
                ]
            })
        )!;
        expect(plan.places[STRUCTURE_EXTENSION]!.slice(0, 2)).to.deep.equal(existingExt);
        expect(plan.places[STRUCTURE_EXTENSION]).to.have.length(60);
        const keys = plan.places[STRUCTURE_EXTENSION]!.map(p => pack(p.x, p.y));
        expect(new Set(keys).size).to.equal(60);
        // No other type may plan onto the incorporated tiles.
        for (const { type, p } of allPlacements(plan, [STRUCTURE_EXTENSION, STRUCTURE_RAMPART])) {
            for (const e of existingExt) {
                expect(p.x === e.x && p.y === e.y, `${type} planned on existing extension`).to.equal(false);
            }
        }
    });

    it("plans one container adjacent to each source and a range-2 controller container", () => {
        const plan = planBase(growthInput())!;
        const containers = plan.places[STRUCTURE_CONTAINER]!;
        for (const source of [pos(10, 40), pos(40, 40)]) {
            expect(containers.filter(c => cheb(c, source) <= 1)).to.have.length(1);
        }
        expect(plan.controllerContainer).to.not.equal(undefined);
        expect(cheb(plan.controllerContainer!, pos(25, 15))).to.equal(2);
        // Adopted containers win over fresh tiles.
        const adopted = planBase(
            growthInput({
                structures: [
                    { type: STRUCTURE_SPAWN, pos: pos(25, 25) },
                    { type: STRUCTURE_CONTAINER, pos: pos(11, 41) }
                ]
            })
        )!;
        const srcAContainers = adopted.places[STRUCTURE_CONTAINER]!.filter(c => cheb(c, pos(10, 40)) <= 1);
        expect(srcAContainers).to.deep.equal([pos(11, 41)]);
    });

    it("omits the controller container when the controller is walled in", () => {
        const walledController: TerrainGrid = {
            isWall: (x, y) => Math.max(Math.abs(x - 25), Math.abs(y - 15)) <= 2 && !(x === 25 && y === 15),
            isSwamp: () => false
        };
        const plan = planBase(growthInput({ terrain: walledController }))!;
        expect(plan.controllerContainer).to.equal(undefined);
        expect(plan.places[STRUCTURE_CONTAINER]).to.have.length(2); // sources only
    });

    it("keeps every lab within range 2 of both input labs", () => {
        const plan = planBase(growthInput())!;
        const labs = plan.places[STRUCTURE_LAB]!;
        const [in1, in2] = labs;
        for (const lab of labs) {
            expect(cheb(lab, in1), `lab@${lab.x},${lab.y} vs input1`).to.be.at.most(2);
            expect(cheb(lab, in2), `lab@${lab.x},${lab.y} vs input2`).to.be.at.most(2);
        }
    });

    it("places links beside their hosts without stealing seats or the upgrade ring", () => {
        const plan = planBase(growthInput())!;
        const links = plan.places[STRUCTURE_LINK]!;
        const storage = plan.places[STRUCTURE_STORAGE]![0];
        const containers = plan.places[STRUCTURE_CONTAINER]!;
        expect(cheb(links[0], storage)).to.equal(1); // hub
        expect(cheb(links[1], plan.controllerContainer!)).to.equal(1);
        expect(cheb(links[1], pos(25, 15))).to.be.at.least(3);
        for (const source of [pos(10, 40), pos(40, 40)]) {
            const srcContainer = containers.find(c => cheb(c, source) <= 1)!;
            const link = links.find(l => cheb(l, srcContainer) <= 1 && cheb(l, source) >= 2);
            expect(link, `source link near ${source.x},${source.y}`).to.not.equal(undefined);
        }
    });

    it("keeps all extensions on the anchor's checkerboard parity", () => {
        const plan = planBase(growthInput())!;
        const parity = (25 + 25) % 2;
        for (const e of plan.places[STRUCTURE_EXTENSION]!) {
            expect((e.x + e.y) % 2, `ext@${e.x},${e.y}`).to.equal(parity);
        }
    });

    it("plans roads from the anchor to every container without crossing buildings", () => {
        const plan = planBase(growthInput())!;
        const roads = plan.places[STRUCTURE_ROAD]!;
        const roadKeys = new Set(roads.map(r => pack(r.x, r.y)));
        const blocked = allPlacements(plan, [STRUCTURE_RAMPART, STRUCTURE_ROAD, STRUCTURE_CONTAINER]);
        for (const { p } of blocked) {
            expect(roadKeys.has(pack(p.x, p.y)), `road on structure @${p.x},${p.y}`).to.equal(false);
        }
        for (const c of plan.places[STRUCTURE_CONTAINER]!) {
            const touching = roads.some(r => cheb(r, c) <= 1);
            expect(touching, `road reaches container @${c.x},${c.y}`).to.equal(true);
        }
    });

    it("ramparts exactly the critical stamp", () => {
        const plan = planBase(growthInput())!;
        const criticals = [
            ...plan.places[STRUCTURE_SPAWN]!,
            ...plan.places[STRUCTURE_TOWER]!,
            ...plan.places[STRUCTURE_STORAGE]!,
            ...plan.places[STRUCTURE_TERMINAL]!
        ];
        const ramparts = new Set(plan.places[STRUCTURE_RAMPART]!.map(r => pack(r.x, r.y)));
        expect(ramparts.size).to.equal(criticals.length);
        for (const c of criticals) {
            expect(ramparts.has(pack(c.x, c.y))).to.equal(true);
        }
    });

    it("is deterministic", () => {
        expect(planBase(growthInput())).to.deep.equal(planBase(growthInput()));
    });

    it("round-trips the packing convention", () => {
        expect(unpack(pack(13, 37), "W1N1")).to.deep.equal(pos(13, 37));
        expect(pack(25, 25)).to.equal(25 * 50 + 25);
    });

    it("returns undefined for an unplannable room", () => {
        const allWall: TerrainGrid = { isWall: () => true, isSwamp: () => false };
        expect(planBase(growthInput({ terrain: allWall, structures: [] }))).to.equal(undefined);
    });
});
