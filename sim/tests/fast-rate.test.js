"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * FAST gate — the post-infrastructure economy from its starting line
 * (infra-built: RCL2 + 5 extensions + all 3 containers + seeded workforce).
 * Proves: the upgrader throttle is released (no investment sites → full upgrader
 * crew) and the container economy sustains a real rate. The full arc lives in
 * tests-full/m3-default.
 */
const at = (series, tick, every) => series[Math.min(Math.floor(tick / every) - 1, series.length - 1)];

describe("fast: post-infrastructure rate (infra-built, 1400 ticks)", function () {
  this.timeout(12 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "infra-built", ticks: 1400, every: 50 });
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.runtimeKills, JSON.stringify(res.runtimeKills)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("upgrades at the container-era rate once staffed", () => {
    const progress = seriesOf(res.timeline, "W1N1", "bot", "progress");
    // Income staffs first by design; the M5 era's scout spawn shifts the queue
    // ~200 ticks right — upgrading starts ~t750 (measured). ~2.5 e/t floor while
    // the crew ramps toward ~5.
    const gained = at(progress, 1400, 50) - at(progress, 800, 50);
    expect(gained, `progress series: ${progress.join(",")}`).to.be.at.least(1500);
  });

  it("keeps the containers in play", () => {
    const contE = seriesOf(res.timeline, "W1N1", "bot", "contEnergy");
    expect(Math.max(...contE), "containers never held energy").to.be.greaterThan(0);
  });

  it("does not let energy rot on the ground", () => {
    // Haulers only looked at piles within 2 tiles of their OWN source, so
    // anything dropped elsewhere was invisible to them: 2,643 energy on the
    // floor and climbing while they idled "no-pile". A healthy room keeps the
    // standing total bounded and, crucially, not monotonically rising.
    //
    // INTERMITTENT under parallel load (see sim/README.md "Known flake"). The
    // context below exists to tell the two causes apart on the next failure:
    // a staffed room that is failing to haul is a real regression, whereas a
    // room that never reached ~5 haulers failed upstream of hauling and the
    // pile is a symptom, not the bug. Standalone this settles at 1 pile / <200.
    const dropped = seriesOf(res.timeline, "W1N1", "bot", "droppedEnergy");
    const piles = seriesOf(res.timeline, "W1N1", "bot", "droppedPiles");
    const creeps = seriesOf(res.timeline, "W1N1", "bot", "creeps");
    const roles = res.timeline.map(s => s.rooms.W1N1.bot.roles);
    const haulers = roles.map(r => r.hauler ?? 0);
    const late = dropped.slice(Math.floor(dropped.length / 2));
    const ctx =
      `droppedEnergy: ${dropped.join(",")}\n` +
      `droppedPiles:  ${piles.join(",")}\n` +
      `creeps:        ${creeps.join(",")}\n` +
      `haulers:       ${haulers.join(",")} (healthy runs reach ~5)`;
    expect(Math.max(...late), ctx).to.be.at.most(1500);
  });

  it("works BOTH sources — miners do not pile onto one", () => {
    // One container is one seat. When every miner of a source targeted it, the
    // losers parked two tiles out, never in harvest range, shoving forever.
    const roles = res.timeline.map(s => s.rooms.W1N1.bot.roles);
    const mining = roles.map(r => (r.miner ?? 0) + (r.worker ?? 0));
    expect(Math.max(...mining)).to.be.at.least(2);
    // Sources drain and regenerate rather than sitting untouched at full.
    const src = seriesOf(res.timeline, "W1N1", "bot", "sourceEnergy");
    expect(Math.min(...src), `sourceEnergy series: ${src.join(",")}`).to.be.lessThan(3000);
  });
});
