"use strict";
const { expect } = require("chai");
const { runScenario, finalOf, seriesOf } = require("../lib/harness");

/*
 * Utilization gate (docs/design/utilization.md): the room must SPEND what it
 * produces rather than leave it decaying on the floor.
 *
 * Ground energy decays `ceil(amount/1000)` per PILE per tick — a flat 1 e/t floor
 * each, however small — so standing piles are a direct, compounding tax on income.
 * The recorded baseline before the loop existed, same scenario at t=1001:
 * **eleven piles holding 1792 energy**, against 20 e/t of production. That is the
 * number this asserts against, and it is why the bar is stated in absolute energy
 * rather than as a ratio: the failure mode is unbounded accumulation.
 */
describe("fast: utilization keeps energy off the floor (rcl2-base, 1500 ticks)", function () {
  this.timeout(20 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "rcl2-base", ticks: 1500, every: 100 });
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.runtimeKills, JSON.stringify(res.runtimeKills)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("does not let the harvest accumulate on the ground", () => {
    // Baseline was 1792 standing at t=1001 and still climbing. Measured with the
    // loop: 84. The bar sits well clear of both so it fails the old behaviour and
    // tolerates ordinary run-to-run variance.
    const ground = seriesOf(res.timeline, "W1N1", "bot", "droppedEnergy");
    const final = ground[ground.length - 1];
    expect(final, `ground energy series: ${ground.join(",")}`).to.be.lessThan(600);
  });

  it("keeps the number of PILES down, which is what decay actually charges for", () => {
    // Eleven piles is 11 e/t of a 20 e/t income regardless of how little each
    // holds — the count is the tax, not the amount.
    // The END state, not the peak: pile count swings tick to tick as haulers pick
    // up and miners drop, so a max over a window catches noise rather than trend.
    // Baseline ended at eleven and climbing; measured with the loop, two.
    const piles = seriesOf(res.timeline, "W1N1", "bot", "droppedPiles");
    expect(piles[piles.length - 1], `pile series: ${piles.join(",")}`).to.be.at.most(8);
  });

  it("spends the energy it collects — the room grows", () => {
    // Extensions are the RCL2 investment; the baseline managed one in 1000 ticks
    // while ~45% of its income decayed.
    const final = finalOf(res.timeline, "W1N1", "bot");
    expect(final.extensions, `extensions: ${final.extensions}`).to.be.at.least(2);
    const progress = seriesOf(res.timeline, "W1N1", "bot", "progress");
    expect(progress[progress.length - 1]).to.be.greaterThan(0);
  });
});
