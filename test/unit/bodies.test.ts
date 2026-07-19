import { expect } from "../helpers/chai";
import { bodyCost, buildBody } from "spawn/bodies";
import { SpawnRole } from "spawn/types";

describe("buildBody", () => {
    it("scales the worker body to the energy budget", () => {
        const small = buildBody(SpawnRole.Worker, 200);
        const big = buildBody(SpawnRole.Worker, 800);
        expect(bodyCost(small)).to.be.at.most(200);
        expect(big.length).to.be.greaterThan(small.length);
        expect(small.includes(WORK) && small.includes(CARRY)).to.equal(true);
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

    it("gives a remote miner one MOVE per WORK so it can actually reach its remote", () => {
        // A home miner parks at its source, so a single MOVE is fine; a remote miner
        // with 1 MOVE crawls one tile per five ticks and wastes its life in transit.
        const remote = buildBody(SpawnRole.Miner, 750, { remote: true });
        const works = remote.filter(part => part === WORK).length;
        expect(works).to.equal(5);
        expect(remote.filter(part => part === MOVE).length).to.equal(works);

        // Scales down with energy, still paired.
        const small = buildBody(SpawnRole.Miner, 550, { remote: true });
        expect(small.filter(part => part === WORK).length).to.equal(3);
        expect(small.filter(part => part === MOVE).length).to.equal(3);

        // Caps at 5 WORK even with abundant energy; the home body keeps 1 MOVE.
        expect(buildBody(SpawnRole.Miner, 3000, { remote: true }).filter(part => part === WORK).length).to.equal(5);
        expect(buildBody(SpawnRole.Miner, 750).filter(part => part === MOVE).length).to.equal(1);
    });
});
