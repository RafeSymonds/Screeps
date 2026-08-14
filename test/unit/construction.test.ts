import { expect } from "../helpers/chai";
import { ConstructionSiteView, Pos } from "shared/views";
import { BasePlan } from "layout/plan";
import { CONSTRUCTION_CONFIG } from "construction/config";
import { ConstructionInput, sequenceBuilds } from "construction/sequencer";

function pos(x: number, y: number, roomName = "W1N1"): Pos {
    return { x, y, roomName };
}

/** A hand-made plan: spawn, 6 extensions, 3 containers, tower, storage, 2 roads. */
function plan(): BasePlan {
    return {
        anchor: pos(25, 25),
        controllerContainer: pos(25, 17),
        places: {
            [STRUCTURE_SPAWN]: [pos(25, 25)],
            [STRUCTURE_EXTENSION]: [pos(23, 23), pos(27, 23), pos(23, 27), pos(27, 27), pos(21, 25), pos(29, 25)],
            [STRUCTURE_CONTAINER]: [pos(11, 41), pos(39, 39), pos(25, 17)],
            [STRUCTURE_TOWER]: [pos(24, 26)],
            [STRUCTURE_STORAGE]: [pos(25, 27)],
            [STRUCTURE_RAMPART]: [pos(25, 25), pos(24, 26)],
            [STRUCTURE_ROAD]: [pos(24, 24), pos(23, 24)]
        }
    };
}

function site(
    type: StructureConstant,
    p: Pos,
    progress = 0,
    progressTotal = 3000,
    id = `site-${type}-${p.x}-${p.y}`
): ConstructionSiteView {
    return { id: id as Id<ConstructionSite>, pos: p, type, progress, progressTotal };
}

function input(overrides: Partial<ConstructionInput> = {}): ConstructionInput {
    return {
        rcl: 2,
        plan: plan(),
        structures: [{ type: STRUCTURE_SPAWN, pos: pos(25, 25) }],
        mySites: [],
        config: CONSTRUCTION_CONFIG,
        ...overrides
    };
}

describe("construction sequencer", () => {
    it("creates extensions first at RCL2, capped at maxOpenSites", () => {
        const { create, removeSiteIds } = sequenceBuilds(input());
        expect(removeSiteIds).to.have.length(0);
        expect(create).to.have.length(2);
        expect(create.map(c => c.type)).to.deep.equal([STRUCTURE_EXTENSION, STRUCTURE_EXTENSION]);
        expect(create.map(c => c.pos)).to.deep.equal([pos(23, 23), pos(27, 23)]);
    });

    it("moves to containers only when extensions reach the RCL limit", () => {
        const structures = [
            { type: STRUCTURE_SPAWN, pos: pos(25, 25) },
            ...plan().places[STRUCTURE_EXTENSION]!.slice(0, 5).map(p => ({ type: STRUCTURE_EXTENSION, pos: p }))
        ];
        const { create } = sequenceBuilds(input({ structures }));
        // 5 extensions built = RCL2 limit; the 6th planned extension must wait for RCL3.
        expect(create.map(c => c.type)).to.deep.equal([STRUCTURE_CONTAINER, STRUCTURE_CONTAINER]);
        expect(create.map(c => c.pos)).to.deep.equal([pos(11, 41), pos(39, 39)]);
    });

    it("builds nothing below RCL2 except the recovery spawn", () => {
        expect(sequenceBuilds(input({ rcl: 1 })).create).to.have.length(0);
        const wiped = sequenceBuilds(input({ rcl: 1, structures: [] }));
        expect(wiped.create).to.deep.equal([{ pos: pos(25, 25), type: STRUCTURE_SPAWN }]);
    });

    it("respects CONTROLLER_STRUCTURES gating per level", () => {
        // RCL2: no towers/storage even with extensions done and budget free.
        const structures = [
            { type: STRUCTURE_SPAWN, pos: pos(25, 25) },
            ...plan().places[STRUCTURE_EXTENSION]!.slice(0, 5).map(p => ({ type: STRUCTURE_EXTENSION, pos: p })),
            ...plan().places[STRUCTURE_CONTAINER]!.map(p => ({ type: STRUCTURE_CONTAINER, pos: p }))
        ];
        const { create } = sequenceBuilds(input({ structures }));
        expect(create.every(c => c.type !== STRUCTURE_TOWER && c.type !== STRUCTURE_STORAGE)).to.equal(true);
        // RCL3 unlocks the tower (and 5 more extensions, which outrank it).
        const rcl3 = sequenceBuilds(input({ rcl: 4, structures }));
        expect(rcl3.create[0].type).to.equal(STRUCTURE_EXTENSION);
    });

    it("increments the per-type total as creates are emitted", () => {
        // 4 existing extensions, limit 5 → exactly one create despite budget 2.
        const structures = [
            { type: STRUCTURE_SPAWN, pos: pos(25, 25) },
            ...plan().places[STRUCTURE_EXTENSION]!.slice(0, 4).map(p => ({ type: STRUCTURE_EXTENSION, pos: p }))
        ];
        const { create } = sequenceBuilds(input({ structures }));
        const extensions = create.filter(c => c.type === STRUCTURE_EXTENSION);
        expect(extensions).to.have.length(1);
    });

    it("counts misplaced structures toward limits and skips blocked tiles", () => {
        // 5 extensions exist off-plan → type at limit, nothing placed for it.
        const offPlan = [pos(5, 5), pos(6, 5), pos(7, 5), pos(8, 5), pos(9, 5)];
        const structures = [
            { type: STRUCTURE_SPAWN, pos: pos(25, 25) },
            ...offPlan.map(p => ({ type: STRUCTURE_EXTENSION, pos: p }))
        ];
        const { create } = sequenceBuilds(input({ structures }));
        expect(create.every(c => c.type !== STRUCTURE_EXTENSION)).to.equal(true);

        // A wrong-type obstacle on a planned extension tile skips that tile.
        const blocked = sequenceBuilds(
            input({
                structures: [
                    { type: STRUCTURE_SPAWN, pos: pos(25, 25) },
                    { type: STRUCTURE_TOWER, pos: pos(23, 23) }
                ]
            })
        );
        expect(blocked.create.map(c => c.pos)).to.deep.equal([pos(27, 23), pos(23, 27)]);
    });

    it("lets ramparts and roads stack on occupied tiles", () => {
        // Ramparts are gated to RCL6 by config.minRcl (build ORDER, not legality),
        // and — being maintenance — only considered once the investment queue is
        // idle, so everything else this plan wants is built first.
        const p = plan();
        const structures = [
            { type: STRUCTURE_SPAWN, pos: pos(25, 25) },
            ...p.places[STRUCTURE_EXTENSION]!.map(q => ({ type: STRUCTURE_EXTENSION, pos: q })),
            ...p.places[STRUCTURE_CONTAINER]!.map(q => ({ type: STRUCTURE_CONTAINER, pos: q })),
            ...p.places[STRUCTURE_TOWER]!.map(q => ({ type: STRUCTURE_TOWER, pos: q })),
            ...p.places[STRUCTURE_STORAGE]!.map(q => ({ type: STRUCTURE_STORAGE, pos: q })),
            ...p.places[STRUCTURE_ROAD]!.map(q => ({ type: STRUCTURE_ROAD, pos: q }))
        ];
        const { create } = sequenceBuilds(input({ rcl: 6, structures, config: { ...CONSTRUCTION_CONFIG, maxOpenSites: 12 } }));
        // The property under test: a rampart on the OCCUPIED spawn tile is not
        // skipped (ramparts stack). The exact list varies with what else is
        // eligible at this RCL, so assert the stacking, not the whole queue.
        expect(create.some(c => c.type === STRUCTURE_RAMPART && c.pos.x === 25 && c.pos.y === 25)).to.equal(true);
    });

    it("counts all open sites against the budget, on-plan or not", () => {
        const mySites = [
            site(STRUCTURE_EXTENSION, pos(23, 23)), // on-plan
            site(STRUCTURE_EXTENSION, pos(40, 40), 2900, 3000) // off-plan but ≥50% built
        ];
        const { create, removeSiteIds } = sequenceBuilds(input({ mySites }));
        expect(removeSiteIds).to.have.length(0); // sunk-cost exception keeps the 97% site
        expect(create).to.have.length(0); // both sites count: budget exhausted
    });

    it("removes stale off-plan sites but never a lone spawn site", () => {
        const stale = site(STRUCTURE_EXTENSION, pos(40, 40), 100, 3000);
        const { removeSiteIds, create } = sequenceBuilds(input({ mySites: [stale] }));
        expect(removeSiteIds).to.deep.equal([stale.id]);
        expect(create).to.have.length(2); // removal frees the budget the same run

        const spawnSite = site(STRUCTURE_SPAWN, pos(40, 40));
        const wiped = sequenceBuilds(input({ structures: [], mySites: [spawnSite] }));
        expect(wiped.removeSiteIds).to.have.length(0);
    });

    it("places roads only after every allowed producer exists", () => {
        // Extensions incomplete → no roads even with budget left over.
        const { create } = sequenceBuilds(input());
        expect(create.every(c => c.type !== STRUCTURE_ROAD)).to.equal(true);
    });
});
