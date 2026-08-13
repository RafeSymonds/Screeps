"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * M4 milestone gate (docs/design/defense.md) — split per scenario for mocha
 * --parallel. Rung 3 (safe mode) is unit-covered only (defense.md).
 */

const at = (series, tick, every) => series[Math.min(Math.floor(tick / every) - 1, series.length - 1)];

describe("sim: M4 defenders carry the towerless room (raid-early, 600 ticks)", function () {
  this.timeout(15 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "raid-early", ticks: 600, every: 20 });
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.runtimeKills, JSON.stringify(res.runtimeKills)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("fields a combat creep", () => {
    // summary classifies any ATTACK-bearing creep as "combat".
    const timelineHasCombat = res.timeline.some(snap => (snap.rooms.W1N1.bot.roles.combat ?? 0) > 0);
    expect(timelineHasCombat, "no combat creep ever existed").to.equal(true);
  });

  it("clears the raiders", () => {
    const hostiles = seriesOf(res.timeline, "W1N1", "bot", "hostiles");
    expect(at(hostiles, 600, 20), `hostiles series: ${hostiles.join(",")}`).to.equal(0);
  });

  it("resumes the economy after the fight", () => {
    // Same proxy correction as under-attack: workforce growth, not progress.
    const creeps = seriesOf(res.timeline, "W1N1", "bot", "creeps");
    expect(creeps[creeps.length - 1], `creeps series: ${creeps.join(",")}`).to.be.greaterThan(creeps[0]);
  });
});
