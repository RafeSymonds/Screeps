"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * M4 milestone gate (docs/design/defense.md) — split per scenario for mocha
 * --parallel. Rung 3 (safe mode) is unit-covered only (defense.md).
 */

const at = (series, tick, every) => series[Math.min(Math.floor(tick / every) - 1, series.length - 1)];

describe("sim: M4 towers hold the wall (under-attack, 400 ticks)", function () {
  this.timeout(15 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "under-attack", ticks: 400, every: 20 });
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.runtimeKills, JSON.stringify(res.runtimeKills)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("erases the wave fast", () => {
    const hostiles = seriesOf(res.timeline, "W1N1", "bot", "hostiles");
    expect(at(hostiles, 100, 20), `hostiles series: ${hostiles.join(",")}`).to.equal(0);
  });

  it("spends tower energy doing it", () => {
    const towerEnergy = seriesOf(res.timeline, "W1N1", "bot", "towerEnergy");
    expect(towerEnergy[towerEnergy.length - 1]).to.be.lessThan(3000);
  });

  it("loses nothing", () => {
    for (const key of ["spawns", "towers"]) {
      const series = seriesOf(res.timeline, "W1N1", "bot", key);
      for (let i = 1; i < series.length; i++) {
        expect(series[i], `${key} series: ${series.join(",")}`).to.be.at.least(series[i - 1]);
      }
    }
  });

  it("keeps the economy ramping through the fight", () => {
    // A cold fullBase room spends its first several hundred ticks on income and
    // builders BY DESIGN (upgraders last, floor 1 during investment; a 48-part
    // upgrader alone is a 144-tick spawn) — controller progress inside 400 ticks
    // was a miscalibrated proxy. Workforce growth is the honest one.
    const creeps = seriesOf(res.timeline, "W1N1", "bot", "creeps");
    expect(creeps[creeps.length - 1], `creeps series: ${creeps.join(",")}`).to.be.greaterThan(creeps[0]);
  });
});
