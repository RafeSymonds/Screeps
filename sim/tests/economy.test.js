"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf, finalOf } = require("../lib/harness");

// Long-term economy behavior on a fresh RCL1 room. Guards against regressions that
// would stall the bootstrap (no spawning, no harvest, CPU blowups, crashes).
describe("sim: economy bootstrap (default, 250 ticks)", function () {
  this.timeout(10 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "default", ticks: 250, every: 10 });
  });

  it("never raises an engine-level or bot error", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
  });

  it("keeps at least one creep alive for the whole run", () => {
    expect(Math.min(...seriesOf(res.timeline, "W1N1", "bot", "creeps"))).to.be.greaterThan(0);
  });

  it("grows the workforce past the initial floor", () => {
    expect(finalOf(res.timeline, "W1N1", "bot").creeps).to.be.greaterThan(1);
  });

  it("harvests energy from sources", () => {
    const src = seriesOf(res.timeline, "W1N1", "bot", "sourceEnergy");
    expect(src[src.length - 1]).to.be.lessThan(src[0]);
  });

  it("keeps CPU within budget", () => {
    expect(Math.max(...seriesOf(res.timeline, "W1N1", "bot", "cpu"))).to.be.lessThan(50);
  });
});
