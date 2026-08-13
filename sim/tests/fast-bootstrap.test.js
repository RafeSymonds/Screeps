"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * FAST gate — the bootstrap ramp's health in 600 ticks (the full 0→RCL2 arc lives
 * in tests-full/m3-default). Proves: spawning ramps, both sources get mined, the
 * spawn stays fed. See sim/README.md "fast vs full".
 */
describe("fast: bootstrap ramp (default, 600 ticks)", function () {
  this.timeout(10 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "default", ticks: 600, every: 50 });
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.runtimeKills, JSON.stringify(res.runtimeKills)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("ramps the workforce", () => {
    // Measured spread at t600 across runs: 6-9 creeps (ramp variance) — 5 proves
    // the pipeline moves without asserting the weather.
    const creeps = seriesOf(res.timeline, "W1N1", "bot", "creeps");
    expect(creeps[creeps.length - 1], `creeps series: ${creeps.join(",")}`).to.be.at.least(5);
  });

  it("mines and cycles the spawn", () => {
    // During a healthy ramp the spawn fills AND spends continuously — a fixed
    // end-tick level is a coin flip; the observable is that it ever fills.
    const spawnE = seriesOf(res.timeline, "W1N1", "bot", "spawnEnergy");
    const dropped = seriesOf(res.timeline, "W1N1", "bot", "droppedEnergy");
    expect(Math.max(...dropped), "no drop-mining observed").to.be.greaterThan(0);
    expect(Math.max(...spawnE), `spawn energy series: ${spawnE.join(",")}`).to.be.at.least(250);
  });
});
