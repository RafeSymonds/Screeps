import { expect } from "../helpers/chai";
import { CpuTier, getTier, throttleMultiplier } from "cpu/CpuBudget";

describe("CpuBudget", () => {
    it("maps bucket levels to tiers", () => {
        expect(getTier(500)).to.equal(CpuTier.Critical);
        expect(getTier(2000)).to.equal(CpuTier.Low);
        expect(getTier(5000)).to.equal(CpuTier.Normal);
        expect(getTier(9500)).to.equal(CpuTier.High);
    });

    it("throttles non-critical passes harder as the bucket drops", () => {
        expect(throttleMultiplier(CpuTier.Critical)).to.be.greaterThan(throttleMultiplier(CpuTier.Normal));
        expect(throttleMultiplier(CpuTier.High)).to.equal(1);
    });
});
