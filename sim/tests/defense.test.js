"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf, finalOf } = require("../lib/harness");

// Tower-defense behavior: a defended base must detect and clear a hostile wave
// without losing its spawns. Guards against regressions in threat assessment /
// tower control that would let raiders survive.
describe("sim: tower defense (under-attack, 25 ticks)", function () {
  this.timeout(10 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "under-attack", ticks: 25, every: 1 });
  });

  it("never raises an engine-level or bot error", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
  });

  it("starts with hostiles present", () => {
    expect(Math.max(...seriesOf(res.timeline, "W1N1", "bot", "hostiles"))).to.be.greaterThan(0);
  });

  it("eliminates every hostile and keeps the room clear", () => {
    const h = seriesOf(res.timeline, "W1N1", "bot", "hostiles");
    expect(Math.min(...h)).to.equal(0);
    expect(h[h.length - 1]).to.equal(0);
  });

  it("clears the wave quickly (within 20 ticks)", () => {
    const cleared = seriesOf(res.timeline, "W1N1", "bot", "hostiles").findIndex((v) => v === 0);
    expect(cleared).to.be.greaterThan(-1);
    expect(cleared).to.be.lessThan(20);
  });

  it("keeps its spawns and creeps through the attack", () => {
    const f = finalOf(res.timeline, "W1N1", "bot");
    expect(f.spawns).to.be.greaterThan(0);
    expect(f.creeps).to.be.greaterThan(0);
  });
});
