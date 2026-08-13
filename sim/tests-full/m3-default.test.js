"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * M3 milestone gate (docs/design/construction.md) — split per scenario so mocha
 * --parallel runs each suite in its own worker (see bin/sim test).
 */

/** series index for a tick when snapshots are every 100: t100 → [0]. */
const at = (series, tick) => series[Math.min(Math.floor(tick / 100) - 1, series.length - 1)];

describe("sim: M3 hands-off building (default, 7500 ticks)", function () {
  this.timeout(120 * 60 * 1000);
  let res;
  let rcl;
  let progress;
  before(async () => {
    res = await runScenario({ scenario: "default", ticks: 7500, every: 100 });
    rcl = seriesOf(res.timeline, "W1N1", "bot", "rcl");
    progress = seriesOf(res.timeline, "W1N1", "bot", "progress");
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.runtimeKills, JSON.stringify(res.runtimeKills)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("reaches RCL2 by tick 1200 (M2 regression)", () => {
    expect(at(rcl, 1200), `rcl series: ${rcl.join(",")}`).to.be.at.least(2);
  });

  // Run-to-run variance on infrastructure milestones is large (±800 ticks measured
  // across identical-code runs — congestion and spawn-timing noise); thresholds
  // below carry ~2× margin over the slowest observed run so the gate detects
  // regressions, not weather.
  it("builds the five RCL2 extensions by tick 5000", () => {
    const ext = seriesOf(res.timeline, "W1N1", "bot", "extensions");
    expect(at(ext, 5000), `extensions series: ${ext.join(",")}`).to.be.at.least(5);
  });

  it("builds all three containers by tick 7000", () => {
    const cont = seriesOf(res.timeline, "W1N1", "bot", "containers");
    expect(at(cont, 7000), `containers series: ${cont.join(",")}`).to.be.at.least(3);
  });

  it("banks total progress that requires the post-infrastructure rate", () => {
    // Slowest observed investment-locked run: 11002 at t6000 (~1.9 e/t floor).
    // Any run whose upgrader throttle releases beats 13000 by t7500 comfortably;
    // a run still locked at the floor cannot reach it.
    expect(at(progress, 7500), `progress series: ${progress.join(",")}`).to.be.at.least(13000);
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
    // Late floor 8: the 550-cap generational turnover troughs at 9 (measured) —
    // the desired steady roster is ~12 and the trough is a ≤ 200-tick dip.
    for (let i = Math.floor(2500 / 100); i < creeps.length; i++) {
      expect(creeps[i], `creep count at snapshot ${i}: ${creeps.join(",")}`).to.be.at.least(8);
    }
  });
});
