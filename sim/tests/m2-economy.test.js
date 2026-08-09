"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * M2 milestone gate (docs/design/economy.md): one room lives. A fresh RCL1 world
 * bootstraps at 300 energy, saturates its sources, sustains creep generations
 * across the 1500-tick lifetime boundary, and holds the pre-container upgrade
 * rate (per-pile decay physics cap the era at ~5-7 e/t; RCL3-at-speed is M3's
 * gate, once extensions exist).
 */
describe("sim: M2 one room lives (default, 2500 ticks)", function () {
  this.timeout(45 * 60 * 1000);
  let res;
  let rcl;
  let progress;
  const at = (series, tick) => series[Math.min(Math.floor(tick / 100) - 1, series.length - 1)];
  before(async () => {
    res = await runScenario({ scenario: "default", ticks: 2500, every: 100 });
    rcl = seriesOf(res.timeline, "W1N1", "bot", "rcl");
    progress = seriesOf(res.timeline, "W1N1", "bot", "progress");
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("reaches RCL2 by tick 1200", () => {
    expect(at(rcl, 1200), `rcl series: ${rcl.join(",")}`).to.be.at.least(2);
  });

  it("sustains the pre-container upgrade rate (≥3.5 e/t between t1500 and t2500)", () => {
    const reachedRcl3 = rcl[rcl.length - 1] >= 3;
    const gained = at(progress, 2500) - at(progress, 1500);
    expect(reachedRcl3 || gained >= 3500, `progress series: ${progress.join(",")}`).to.equal(true);
  });

  it("controller progress never decreases within an RCL", () => {
    for (let i = 1; i < progress.length; i++) {
      if (rcl[i] === rcl[i - 1]) {
        expect(progress[i], `progress dipped at snapshot ${i}`).to.be.at.least(progress[i - 1]);
      }
    }
  });

  it("sustains the workforce across creep generations", () => {
    const creeps = seriesOf(res.timeline, "W1N1", "bot", "creeps");
    for (let i = Math.floor(900 / 100); i < creeps.length; i++) {
      expect(creeps[i], `creep count at snapshot ${i}: ${creeps.join(",")}`).to.be.at.least(15);
    }
  });
});
