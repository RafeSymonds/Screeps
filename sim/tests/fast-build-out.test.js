"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * FAST gate — construction sequencing from the build-out era's starting line
 * (rcl2-base: RCL2, seeded workforce, empty footprint). Proves: layout plans,
 * construction places ≤2 prioritized sites, builders complete an extension.
 * The full arc lives in tests-full/m3-default.
 */
const at = (series, tick, every) => series[Math.min(Math.floor(tick / every) - 1, series.length - 1)];

describe("fast: build-out (rcl2-base, 1200 ticks)", function () {
  this.timeout(12 * 60 * 1000);
  let res;
  before(async () => {
    // 1200: the M5 era adds a scout spawn + seeded neighbors, shifting the
    // build timeline ~200 ticks right (measured).
    res = await runScenario({ scenario: "rcl2-base", ticks: 1200, every: 50 });
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.runtimeKills, JSON.stringify(res.runtimeKills)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("places sites promptly and never spreads", () => {
    const sites = seriesOf(res.timeline, "W1N1", "bot", "sites");
    expect(at(sites, 200, 50), `sites series: ${sites.join(",")}`).to.be.at.least(1);
    for (const n of sites) {
      expect(n, `sites series: ${sites.join(",")}`).to.be.at.most(2);
    }
  });

  it("completes an extension", () => {
    const ext = seriesOf(res.timeline, "W1N1", "bot", "extensions");
    expect(ext[ext.length - 1], `extensions series: ${ext.join(",")}`).to.be.at.least(1);
  });
});
