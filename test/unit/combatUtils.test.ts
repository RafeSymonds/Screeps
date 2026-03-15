import { assert } from "chai";
import { selectPriorityHostile, hostileThreat, requestedDefenders } from "../../src/combat/CombatUtils";
import { resetScreeps, body } from "../helpers/screeps-fixture";

function makeHostile(parts: BodyPartConstant[], x: number, y: number, hits?: number): Creep {
    const b = body(parts);
    const maxHits = b.length * 100;
    return {
        pos: new RoomPosition(x, y, "W0N0"),
        body: b,
        hits: hits ?? maxHits,
        hitsMax: maxHits
    } as unknown as Creep;
}

describe("CombatUtils", () => {
    beforeEach(() => {
        resetScreeps();
    });

    describe("selectPriorityHostile", () => {
        it("prioritizes healers over melee attackers", () => {
            const origin = new RoomPosition(25, 25, "W0N0");
            const attacker = makeHostile([ATTACK, ATTACK, MOVE], 26, 26);
            const healer = makeHostile([HEAL, MOVE], 27, 27);

            const target = selectPriorityHostile(origin, [attacker, healer]);

            assert.strictEqual(target, healer, "healer should be targeted first");
        });

        it("prefers damaged targets over healthy ones at similar range", () => {
            const origin = new RoomPosition(25, 25, "W0N0");
            const healthy = makeHostile([RANGED_ATTACK, MOVE], 26, 26);
            const damaged = makeHostile([RANGED_ATTACK, MOVE], 27, 27, 50);

            const target = selectPriorityHostile(origin, [healthy, damaged]);

            assert.strictEqual(target, damaged, "damaged target should be preferred");
        });

        it("returns null for empty hostiles", () => {
            const origin = new RoomPosition(25, 25, "W0N0");
            assert.isNull(selectPriorityHostile(origin, []));
        });
    });

    describe("hostileThreat", () => {
        it("weights HEAL parts highest", () => {
            const healer = makeHostile([HEAL, MOVE], 25, 25);
            const attacker = makeHostile([ATTACK, MOVE], 25, 25);

            assert.isAbove(hostileThreat(healer as any), hostileThreat(attacker as any));
        });
    });

    describe("requestedDefenders", () => {
        it("requests at least 1 defender against any hostile", () => {
            const hostile = makeHostile([ATTACK, MOVE], 25, 25);
            assert.isAtLeast(requestedDefenders([hostile as any]), 1);
        });

        it("caps defenders at 4", () => {
            const hostiles = Array.from({ length: 10 }, () =>
                makeHostile([HEAL, HEAL, ATTACK, ATTACK, MOVE, MOVE], 25, 25)
            );
            assert.isAtMost(requestedDefenders(hostiles as any[]), 4);
        });
    });
});
