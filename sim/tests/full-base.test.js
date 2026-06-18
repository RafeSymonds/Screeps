"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf, finalOf } = require("../lib/harness");

// Steady-state behavior on a mature RCL8 room. Guards against crashes and CPU
// blowups at scale, and against the bot losing/miscounting its own structures.
describe("sim: steady state (full-base RCL8, 40 ticks)", function () {
  this.timeout(10 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "full-base", ticks: 40, every: 10 });
  });

  it("never raises an engine-level or bot error", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
  });

  it("stays at RCL8", () => {
    expect(finalOf(res.timeline, "W1N1", "bot").rcl).to.equal(8);
  });

  it("retains its structures", () => {
    const f = finalOf(res.timeline, "W1N1", "bot");
    expect(f.spawns).to.equal(3);
    expect(f.extensions).to.equal(60);
    expect(f.towers).to.equal(6);
  });

  it("keeps CPU within budget at scale", () => {
    expect(Math.max(...seriesOf(res.timeline, "W1N1", "bot", "cpu"))).to.be.lessThan(150);
  });
});
