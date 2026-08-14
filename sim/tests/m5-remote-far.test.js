"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * Reach gate (docs/design/remotes.md "How far", docs/design/intel.md "Reach"):
 * the room worth mining is TWO borders out and the one next door is barren.
 *
 * This is the case depth-1 candidate selection could not do at all — not slowly,
 * not badly, at all. `describeExits` names four rooms, typically two of them
 * highways, and if none of that sample has sources the bot simply has no remotes.
 * Here the only worthwhile room is W3N1, reachable only through the empty W2N1.
 */
describe("m5: remote mining two rooms out (remote-far, 2200 ticks)", function () {
    this.timeout(25 * 60 * 1000);
    let res;
    before(async () => {
        res = await runScenario({ scenario: "remote-far", ticks: 2200, every: 50 });
    });

    it("runs without engine or bot errors", () => {
        expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
        expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
        expect(res.runtimeKills, JSON.stringify(res.runtimeKills)).to.have.length(0);
        expect(res.memories.bot.stats.counters.errors).to.equal(0);
    });

    it("scouts past the barren neighbour to the room two borders out", () => {
        // Intel for W3N1 can only exist if a creep stood in it, and the only way
        // there is through W2N1 — so this is the scout depth, not a lucky glimpse.
        expect(res.memories.bot.intel.rooms.W2N1, "no intel for W2N1").to.not.equal(undefined);
        expect(res.memories.bot.intel.rooms.W3N1, "no intel for W3N1 (scout never got two rooms out)").to.not.equal(
            undefined
        );
    });

    it("adopts the two-source room at depth 2, not the barren one next door", () => {
        const adopted = res.memories.bot.rooms.W1N1.remotes.rooms;
        expect(adopted.W3N1, `adopted: ${JSON.stringify(Object.keys(adopted))}`).to.not.equal(undefined);
        expect(adopted.W2N1, "adopted the sourceless neighbour").to.equal(undefined);
    });

    it("actually works it — miners and haulers reach W3N1", () => {
        const roles = res.timeline.map(s => s.rooms.W3N1.bot.roles);
        const miners = roles.map(r => (r.miner ?? 0) + (r.worker ?? 0));
        expect(Math.max(...miners), `W3N1 roles: ${JSON.stringify(roles)}`).to.be.at.least(1);
        // Mining shows as the source dipping below its cap; the engine clamps a
        // neutral source to 1500 and a reserved one to 3000.
        const srcE = seriesOf(res.timeline, "W3N1", "bot", "sourceEnergy");
        expect(Math.min(...srcE), `W3N1 sourceEnergy series: ${srcE.join(",")}`).to.be.lessThan(2900);
    });
});
