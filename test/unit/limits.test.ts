import { expect } from "../helpers/chai";
import { LimitReason, workerCeiling } from "economy/limits";

/** A comfortable room: nothing binds except demand. */
function base(overrides: Partial<Parameters<typeof workerCeiling>[0]> = {}): Parameters<typeof workerCeiling>[0] {
    return {
        wantedByDemand: 4,
        cpuHeadroom: 20,
        spawns: 1,
        incomeParts: 40,
        incomeCost: 3000,
        workerParts: 18,
        workerCost: 1200,
        production: 20,
        spawnDutyCeiling: 0.8,
        upkeepFraction: 1,
        ...overrides
    };
}

describe("workforce ceilings", () => {
    it("grows to the LEAST limit and names which one", () => {
        // The whole point of replacing `maxCreepsPerRoom: 20`: a creep is 4 parts
        // and 250 energy at RCL1 and 40 parts and 3000 at RCL8, so one headcount
        // cannot be right for both. Each limit is computed from what it depends on.
        expect(workerCeiling(base()).reason).to.equal(LimitReason.Demand);
        expect(workerCeiling(base()).workers).to.equal(4);

        expect(workerCeiling(base({ cpuHeadroom: 2 })).reason).to.equal(LimitReason.Cpu);
        expect(workerCeiling(base({ cpuHeadroom: 2 })).workers).to.equal(2);
    });

    it("refuses more creeps than the spawn can keep alive", () => {
        // A creep takes 3 ticks per part to build and lives 1500, so one spawn
        // sustains 1500/(3 × parts) of them. Ask for more and they die faster than
        // they are replaced — a limit no headcount constant can express, because
        // it depends on how big the bodies are.
        const huge = workerCeiling(base({ wantedByDemand: 99, workerParts: 50, incomeParts: 0 }));
        expect(huge.reason).to.equal(LimitReason.SpawnThroughput);
        expect(huge.workers).to.equal(8); // 1500 × 0.8 / (3 × 50)

        // Two spawns, twice the throughput.
        const two = workerCeiling(base({ wantedByDemand: 99, workerParts: 50, incomeParts: 0, spawns: 2 }));
        expect(two.workers).to.equal(16);
    });

    it("refuses a workforce the room's income cannot replace", () => {
        // Upkeep is bodyCost/1500 per creep per tick and it never stops. At the
        // physical limit (upkeepFraction 1) the room is spending its entire income
        // replacing creeps and has nothing left to do anything with.
        const poor = workerCeiling(base({ wantedByDemand: 99, production: 4, incomeCost: 0, workerCost: 1200 }));
        expect(poor.reason).to.equal(LimitReason.Upkeep);
        expect(poor.workers).to.equal(5); // 4 e/t × 1500 / 1200

        // Doubling income doubles what it can keep alive.
        expect(workerCeiling(base({ wantedByDemand: 99, production: 8, incomeCost: 0 })).workers).to.equal(10);
    });

    it("charges income roles against the same budgets before workers get any", () => {
        // Miners and haulers are what create the income; workers spend what is
        // left. A room whose income roles already eat the spawn or the income has
        // no room for discretionary creeps.
        const eaten = workerCeiling(base({ wantedByDemand: 99, incomeCost: 20 * 1500, production: 20 }));
        expect(eaten.workers).to.equal(0);
        expect(eaten.reason).to.equal(LimitReason.Upkeep);
    });

    it("never returns a negative headcount", () => {
        const over = workerCeiling(base({ cpuHeadroom: -5, incomeParts: 100_000, incomeCost: 10_000_000 }));
        expect(over.workers).to.equal(0);
        expect(Object.values(over.limits).every(n => n >= 0)).to.equal(true);
    });

    it("reports demand rather than blaming a limit that merely ties it", () => {
        // Being demand-bound is the healthy state; it should not be reported as a
        // CPU problem just because the numbers happen to match.
        const tie = workerCeiling(base({ wantedByDemand: 4, cpuHeadroom: 4 }));
        expect(tie.reason).to.equal(LimitReason.Demand);
    });
});
