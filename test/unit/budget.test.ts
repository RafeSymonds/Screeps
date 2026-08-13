import { expect } from "../helpers/chai";
import { BUDGET_CONFIG, BudgetConfig, computeAllowance } from "shared/budget";

/*
 * The CPU allowance (docs/design/budget.md). Every case here is pure arithmetic
 * over architecture §9's budget table.
 */
describe("cpu budget", () => {
    it("reproduces architecture §9's table exactly at 20 CPU / 3 rooms", () => {
        // THE anchor test. §9: "1 + 2 + 3×(2.5 + 1.5) + 1 = 16 CPU for 3 owned
        // rooms + their remotes". Inverted, each room's share is 2.5 + 1.5 = 4.0.
        // If this drifts, either budget.ts or architecture §9 moved and the other
        // must follow — that is the point of pinning it.
        expect(computeAllowance(20, 3).roomShareCpu).to.equal(4);
    });

    it("shrinks the per-room share as the empire grows", () => {
        const one = computeAllowance(20, 1).roomShareCpu;
        const two = computeAllowance(20, 2).roomShareCpu;
        const three = computeAllowance(20, 3).roomShareCpu;
        expect(one).to.be.greaterThan(two);
        expect(two).to.be.greaterThan(three);
        // The bug this subsystem exists to fix: a fixed cap let each of N rooms
        // spend a budget sized for one.
        expect(computeAllowance(20, 1).creepsPerRoom).to.be.at.least(computeAllowance(20, 3).creepsPerRoom);
    });

    it("never decreases an allowance when CPU increases", () => {
        let prev = -1;
        for (const limit of [10, 20, 50, 100, 300]) {
            const got = computeAllowance(limit, 2).creepsPerRoom;
            expect(got, `limit ${limit}`).to.be.at.least(prev);
            prev = got;
        }
    });

    it("falls back to the MMO limit rather than silently disabling the empire", () => {
        // An absent Game.cpu.limit would otherwise floor remotes to 0 and creeps
        // to the minimum — indistinguishable from "remote mining is broken".
        for (const bad of [0, -5, NaN, Infinity, undefined as unknown as number]) {
            const got = computeAllowance(bad, 1);
            expect(got, `limit ${String(bad)}`).to.deep.equal(computeAllowance(20, 1));
        }
    });

    it("floors at viability rather than starving a room to death", () => {
        // An empty room produces nothing and then dies, which is worse per CPU
        // than any overspend — the floor is applied last and unconditionally.
        const starved = computeAllowance(1, 8);
        expect(starved.creepsPerRoom).to.equal(BUDGET_CONFIG.minCreepsPerRoom);
        expect(starved.creepsPerRoom).to.be.greaterThan(0);
    });

    it("floors remotes at zero — optional income, unlike a room's own economy", () => {
        expect(computeAllowance(1, 8).remotesPerHome).to.equal(0);
    });

    it("respects the ceilings when CPU is abundant", () => {
        const rich = computeAllowance(1000, 1);
        expect(rich.creepsPerRoom).to.equal(BUDGET_CONFIG.maxCreepsPerRoom);
        expect(rich.remotesPerHome).to.equal(BUDGET_CONFIG.maxRemotesPerHome);
    });

    it("allows more than one remote when the share affords it — the old constant could not", () => {
        // maxRemotesPerHome was pinned at 1 because nothing computed affordability.
        expect(computeAllowance(20, 1).remotesPerHome).to.be.greaterThan(1);
    });

    it("survives zero owned rooms (total loss, awaiting respawn placement)", () => {
        const none = computeAllowance(20, 0);
        expect(Number.isFinite(none.roomShareCpu)).to.equal(true);
        expect(none.creepsPerRoom).to.be.greaterThan(0);
        // Treated as one room, so the first re-owned room gets a full share.
        expect(none.roomShareCpu).to.equal(computeAllowance(20, 1).roomShareCpu);
    });

    it("floors fractional headcounts rather than rounding up", () => {
        // Rounding up is how a per-room budget silently becomes an overspend
        // multiplied by the number of rooms.
        const cfg: BudgetConfig = { ...BUDGET_CONFIG, minCreepsPerRoom: 0, maxCreepsPerRoom: 999 };
        const got = computeAllowance(20, 3, cfg).creepsPerRoom;
        expect(got).to.equal(Math.floor(got));
        // 2.5 room CPU − 0.5 planner = 2.0, / 0.35 = 5.71 → 5, not 6.
        expect(got).to.equal(5);
    });

    it("is a pure function of its inputs", () => {
        const a = computeAllowance(20, 2);
        const b = computeAllowance(20, 2);
        expect(a).to.deep.equal(b);
    });
});
