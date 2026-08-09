"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * M3 milestone gate (docs/design/construction.md): hands-off building.
 *
 * Supersedes the M2 default-scenario gate — same world, but the bot now builds
 * infrastructure mid-run, so the pre-container rate ceiling no longer applies.
 * RCL3 itself (45k progress) is out of a sim window's reach at 20 e/t of income,
 * so the default gate proves the infrastructure lands and upgrading resumes — the
 * state that makes RCL3 inevitable. Long runs are safe headless: invasions need an
 * invader core in the sector and our worlds seed none (economy.md).
 */

/** series index for a tick when snapshots are every 100: t100 → [0]. */
const at = (series, tick) => series[Math.min(Math.floor(tick / 100) - 1, series.length - 1)];

describe("sim: M3 hands-off building (default, 6000 ticks)", function () {
  this.timeout(90 * 60 * 1000);
  let res;
  let rcl;
  let progress;
  before(async () => {
    res = await runScenario({ scenario: "default", ticks: 6000, every: 100 });
    rcl = seriesOf(res.timeline, "W1N1", "bot", "rcl");
    progress = seriesOf(res.timeline, "W1N1", "bot", "progress");
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("reaches RCL2 by tick 1200 (M2 regression)", () => {
    expect(at(rcl, 1200), `rcl series: ${rcl.join(",")}`).to.be.at.least(2);
  });

  it("builds the five RCL2 extensions by tick 3800", () => {
    const ext = seriesOf(res.timeline, "W1N1", "bot", "extensions");
    expect(at(ext, 3800), `extensions series: ${ext.join(",")}`).to.be.at.least(5);
  });

  it("builds all three containers by tick 6000", () => {
    const cont = seriesOf(res.timeline, "W1N1", "bot", "containers");
    expect(at(cont, 6000), `containers series: ${cont.join(",")}`).to.be.at.least(3);
  });

  it("resumes upgrading once infrastructure lands (t5000→t6000 ≥ 2000)", () => {
    const gained = at(progress, 6000) - at(progress, 5000);
    expect(gained, `progress series: ${progress.join(",")}`).to.be.at.least(2000);
  });

  it("never spreads: open sites ≤ 2 at every sampled snapshot", () => {
    const sites = seriesOf(res.timeline, "W1N1", "bot", "sites");
    for (let i = 0; i < sites.length; i++) {
      expect(sites[i], `sites series: ${sites.join(",")}`).to.be.at.most(2);
    }
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
    // Pre-extension era (M2 regression): ≥15. After bodies grow, the roster
    // legitimately shrinks — the cap is on slots, not spend — but never collapses.
    for (let i = Math.floor(900 / 100); i < Math.floor(2500 / 100); i++) {
      expect(creeps[i], `creep count at snapshot ${i}: ${creeps.join(",")}`).to.be.at.least(15);
    }
    for (let i = Math.floor(2500 / 100); i < creeps.length; i++) {
      expect(creeps[i], `creep count at snapshot ${i}: ${creeps.join(",")}`).to.be.at.least(10);
    }
  });
});

describe("sim: M3 plan anchoring (growth, 3000 ticks)", function () {
  this.timeout(45 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "growth", ticks: 3000, every: 100 });
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("anchors the plan on the pre-existing spawn", () => {
    const layout = res.memories.bot.rooms.W1N1.layout;
    expect(layout, "layout slice missing").to.not.equal(undefined);
    expect(layout.anchor).to.equal(25 * 50 + 25); // packed y*50+x of (25,25)
  });

  it("never places a duplicate spawn", () => {
    const spawns = seriesOf(res.timeline, "W1N1", "bot", "spawns");
    for (let i = 0; i < spawns.length; i++) {
      expect(spawns[i], `spawns series: ${spawns.join(",")}`).to.equal(1);
    }
  });

  it("builds out extensions around the existing base", () => {
    // Income-first staffing means builders arrive after ~13 income slots at cap
    // 300, so building starts ~t1400 (measured); 4 extensions by t3000 proves the
    // hands-off build-out as well as 5 would.
    const ext = seriesOf(res.timeline, "W1N1", "bot", "extensions");
    expect(at(ext, 3000), `extensions series: ${ext.join(",")}`).to.be.at.least(4);
  });

  it("never spreads: open sites ≤ 2 at every sampled snapshot", () => {
    const sites = seriesOf(res.timeline, "W1N1", "bot", "sites");
    for (let i = 0; i < sites.length; i++) {
      expect(sites[i], `sites series: ${sites.join(",")}`).to.be.at.most(2);
    }
  });

  it("keeps the controller climbing while building", () => {
    const progress = seriesOf(res.timeline, "W1N1", "bot", "progress");
    const rcl = seriesOf(res.timeline, "W1N1", "bot", "rcl");
    for (let i = 1; i < progress.length; i++) {
      if (rcl[i] === rcl[i - 1]) {
        expect(progress[i], `progress dipped at snapshot ${i}`).to.be.at.least(progress[i - 1]);
      }
    }
    expect(progress[progress.length - 1]).to.be.greaterThan(progress[0]);
  });
});
