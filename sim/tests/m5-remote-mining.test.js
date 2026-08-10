"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * M5 gate — the remote arc (docs/design/remotes.md): scout sights the neighbor,
 * intel records it, remotes adopts it, remote workers cross the border and mine
 * it home. The arc is inherently short (no full/fast split needed).
 */
describe("m5: remote mining (remote-mining, 2000 ticks)", function () {
  this.timeout(25 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "remote-mining", ticks: 2000, every: 50 });
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("sights and adopts the neighbor", () => {
    expect(res.memories.bot.intel.rooms.W2N1, "no intel for W2N1").to.not.equal(undefined);
    expect(res.memories.bot.rooms.W1N1.remotes.rooms.W2N1, "W2N1 not adopted").to.not.equal(undefined);
  });

  it("works the remote", () => {
    const remoteCreeps = seriesOf(res.timeline, "W2N1", "bot", "creeps");
    expect(Math.max(...remoteCreeps), `W2N1 creeps series: ${remoteCreeps.join(",")}`).to.be.at.least(2);
    // The engine clamps neutral sources to 1500; mining shows as dips below cap
    // (or 3000 once the reserver lands).
    const srcE = seriesOf(res.timeline, "W2N1", "bot", "sourceEnergy");
    expect(Math.min(...srcE), `W2N1 sourceEnergy series: ${srcE.join(",")}`).to.be.lessThan(2900);
  });

  it("reserves per the decision at cap 1300", () => {
    expect(res.memories.bot.rooms.W1N1.remotes.rooms.W2N1.reserved).to.equal(true);
  });
});
