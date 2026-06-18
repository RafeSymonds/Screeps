import { expect } from "../helpers/chai";
import { bodyCost, buildBody } from "spawn/bodies";
import { SpawnRole } from "spawn/types";

describe("buildBody", () => {
    it("scales the generalist body to the energy budget", () => {
        const small = buildBody(SpawnRole.Generalist, 200);
        const big = buildBody(SpawnRole.Generalist, 800);
        expect(bodyCost(small)).to.be.at.most(200);
        expect(big.length).to.be.greaterThan(small.length);
    });

    it("builds haulers with carry and no work", () => {
        const body = buildBody(SpawnRole.Hauler, 300);
        expect(body.includes(CARRY)).to.equal(true);
        expect(body.includes(WORK)).to.equal(false);
    });

    it("never exceeds the energy budget", () => {
        for (const energy of [150, 300, 550, 1300]) {
            expect(bodyCost(buildBody(SpawnRole.Worker, energy))).to.be.at.most(Math.max(energy, 200));
        }
    });
});
