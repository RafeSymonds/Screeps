"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * FAST gates — M4's three durability behaviors at minimum tick counts (full
 * versions in tests-full/). Grouped in one file: each is short, and a worker
 * slot per 200-tick suite would waste its startup cost.
 */
const at = (series, tick, every) => series[Math.min(Math.floor(tick / every) - 1, series.length - 1)];

describe("fast: towers erase the wave (under-attack, 200 ticks)", function () {
  this.timeout(8 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "under-attack", ticks: 200, every: 20 });
  });

  it("runs clean, kills fast, spends energy, loses nothing", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.runtimeKills, JSON.stringify(res.runtimeKills)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
    const hostiles = seriesOf(res.timeline, "W1N1", "bot", "hostiles");
    expect(at(hostiles, 100, 20), `hostiles series: ${hostiles.join(",")}`).to.equal(0);
    const towerE = seriesOf(res.timeline, "W1N1", "bot", "towerEnergy");
    expect(towerE[towerE.length - 1]).to.be.lessThan(3000);
    const spawns = seriesOf(res.timeline, "W1N1", "bot", "spawns");
    for (const n of spawns) expect(n).to.be.at.least(2);
  });
});

describe("fast: defenders carry the towerless room (raid-early, 400 ticks)", function () {
  this.timeout(8 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "raid-early", ticks: 400, every: 20 });
  });

  it("runs clean, fields a combat creep, clears the raiders", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.runtimeKills, JSON.stringify(res.runtimeKills)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
    const combat = res.timeline.some(snap => (snap.rooms.W1N1.bot.roles.combat ?? 0) > 0);
    expect(combat, "no combat creep ever existed").to.equal(true);
    const hostiles = seriesOf(res.timeline, "W1N1", "bot", "hostiles");
    expect(hostiles[hostiles.length - 1], `hostiles series: ${hostiles.join(",")}`).to.equal(0);
  });
});

describe("fast: wipe recovery un-wedged (wiped-base, 800 ticks)", function () {
  this.timeout(10 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "wiped-base", ticks: 800, every: 50 });
  });

  it("runs clean and respawns a workforce (un-wedged)", () => {
    // The fast tier proves the wedge is gone (roster grows past the old 2-3
    // plateau); "upgrading resumed" needs ~1200+ ticks and lives in
    // tests-full/m4-wiped-base.
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.runtimeKills, JSON.stringify(res.runtimeKills)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
    const creeps = seriesOf(res.timeline, "W1N1", "bot", "creeps");
    expect(at(creeps, 300, 50), `creeps series: ${creeps.join(",")}`).to.be.at.least(2);
    expect(creeps[creeps.length - 1], `creeps series: ${creeps.join(",")}`).to.be.at.least(6);
  });
});
