"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * M4 milestone gate (docs/design/defense.md) — split per scenario for mocha
 * --parallel. Rung 3 (safe mode) is unit-covered only (defense.md).
 */

const at = (series, tick, every) => series[Math.min(Math.floor(tick / every) - 1, series.length - 1)];

describe("sim: M4 wipe recovery (wiped-base, 1500 ticks)", function () {
  this.timeout(30 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "wiped-base", ticks: 1500, every: 50 });
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("respawns a workforce fast — full stores mean ideal bodies immediately", () => {
    const creeps = seriesOf(res.timeline, "W1N1", "bot", "creeps");
    expect(at(creeps, 300, 50), `creeps series: ${creeps.join(",")}`).to.be.at.least(1);
    expect(at(creeps, 1000, 50), `creeps series: ${creeps.join(",")}`).to.be.at.least(6);
  });

  it("resumes upgrading", () => {
    const progress = seriesOf(res.timeline, "W1N1", "bot", "progress");
    expect(progress[progress.length - 1], `progress series: ${progress.join(",")}`).to.be.greaterThan(0);
  });
});
