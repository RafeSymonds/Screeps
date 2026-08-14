import { expect } from "../helpers/chai";
import { BUDGET_CONFIG, BudgetConfig, computeAllowance, nonCreepOverhead } from "shared/budget";

const guessedAllowance = (): number => computeAllowance(20, 2).creepsPerRoom;

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

    it("still clamps the room workforce — and that clamp is NOT a CPU limit", () => {
        // Removing it was tried and reverted: it let an RCL1 room demand the 20
        // one-WORK workers its production could theoretically feed, the spawn
        // queue then always held something affordable, and spawn energy never left
        // the floor — so `raid-early` could not fund a defender. The number stands
        // in for early-game spawn economics, which are measured but unmodelled;
        // see the note in budget.ts for what has to be measured to delete it.
        const rich = computeAllowance(1000, 1);
        expect(rich.creepsPerRoom).to.equal(BUDGET_CONFIG.maxCreepsPerRoom);
        expect(rich.remotesPerHome).to.equal(BUDGET_CONFIG.maxRemotesPerHome);
    });

    it("allows more than one remote when the share affords it — the old constant could not", () => {
        // maxRemotesPerHome was pinned at 1 because nothing computed affordability.
        expect(computeAllowance(20, 1).remotesPerHome).to.be.greaterThan(1);
    });

    it("expresses the remote share in creeps as well as rooms", () => {
        // Rooms are the wrong unit on their own: a remote two rooms out needs
        // roughly double the haulers of one next door, so counting rooms prices
        // them identically. The creep figure is the same share without the
        // per-remote averaging — remotesPerHome × creepsPerRemote, un-rounded.
        const got = computeAllowance(20, 1);
        expect(got.remoteCreepsAllowed).to.equal(12);
        expect(got.remoteCreepsAllowed).to.be.at.least(got.remotesPerHome * BUDGET_CONFIG.creepsPerRemote);
        // It shrinks with the empire for the same reason everything else does.
        expect(computeAllowance(20, 3).remoteCreepsAllowed).to.be.lessThan(got.remoteCreepsAllowed);
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

    it("uses the MEASURED cost of a creep when the bot has learned it", () => {
        // 0.35 was a guess, marked provisional because the sim measures isolate
        // execution time rather than the game's flat 0.2-per-intent charge. The
        // first live shard disagreed: dozens of creeps at ~12 CPU, where the guess
        // said the cap should already have bitten. A wrong price multiplies by
        // every creep in the empire, so it is worth learning.
        // Two rooms, so the workforce clamp is not what is being measured.
        const guessed = computeAllowance(20, 2).creepsPerRoom;
        const cheaper = computeAllowance(20, 2, BUDGET_CONFIG, 0.2).creepsPerRoom;
        expect(cheaper).to.be.greaterThan(guessed);
        const dearer = computeAllowance(20, 2, BUDGET_CONFIG, 0.6).creepsPerRoom;
        expect(dearer).to.be.lessThan(guessed);
    });

    it("clamps the measured rate so one strange window cannot resize the empire", () => {
        // Floor is the engine's flat intent charge: a creep that acts at all costs
        // 0.2, so a lower reading is a measurement artifact, not a bargain.
        const at = (rate: number): number => computeAllowance(20, 2, BUDGET_CONFIG, rate).creepsPerRoom;
        expect(at(0.0001)).to.equal(at(BUDGET_CONFIG.minMeasuredCpuPerCreep));
        expect(at(99)).to.equal(at(BUDGET_CONFIG.maxMeasuredCpuPerCreep));
        // Garbage is ignored rather than propagated.
        expect(at(NaN)).to.equal(guessedAllowance());
    });

    it("subtracts only the CPU that does not scale with creeps", () => {
        // Dividing a measured total by creep count without removing the fixed
        // costs would price the overhead into every creep and shrink the roster.
        expect(nonCreepOverhead(1)).to.be.greaterThan(0);
        expect(nonCreepOverhead(3)).to.be.greaterThan(nonCreepOverhead(1));
    });

    it("is a pure function of its inputs", () => {
        const a = computeAllowance(20, 2);
        const b = computeAllowance(20, 2);
        expect(a).to.deep.equal(b);
    });
});
