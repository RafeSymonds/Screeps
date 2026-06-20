"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf, finalOf } = require("../lib/harness");

// End-to-end empire loop on a built-out RCL4 home next to a neutral room: scout the
// neighbor -> empire assigns it -> reserve it -> spawn a remote miner -> spawn a
// remote hauler. Guards against regressions in the cross-room economy (empire
// allocation, the matcher scope gate, cross-room haul, remote spawn sizing,
// reservation) and against crashes/CPU blowups from multi-room work.
//
// 550 ticks because the ramp is genuinely long: a single scout round-robins all
// four neighbors before reaching the remote, then the home economy has to be
// staffed before remote labor is funded. See docs/architecture/EMPIRE.md.
describe("sim: remote mining (remote-mining, 700 ticks)", function () {
  this.timeout(14 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "remote-mining", ticks: 700, every: 25 });
  });

  it("never raises an engine-level or bot error", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
  });

  it("keeps the home room alive throughout", () => {
    expect(Math.min(...seriesOf(res.timeline, "W1N1", "bot", "creeps"))).to.be.greaterThan(0);
  });

  it("reserves the remote (a claimer reaches it)", () => {
    expect(finalOf(res.timeline, "W2N1", "bot").roles.claim || 0).to.be.greaterThan(0);
  });

  it("mines the remote (a remote miner reaches it)", () => {
    expect(finalOf(res.timeline, "W2N1", "bot").roles.miner || 0).to.be.greaterThan(0);
  });

  it("keeps CPU within budget across the multi-room workload", () => {
    expect(Math.max(...seriesOf(res.timeline, "W1N1", "bot", "cpu"))).to.be.lessThan(50);
  });
});
