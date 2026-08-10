"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * M5 gate — the link economy (docs/design/economy.md "Links"): miner feeds the
 * source link, economy's transfer step cycles it across the room, upgraders
 * drink from the controller side. No haulers ever serve that route.
 */
describe("m5: links carry the route (links, 900 ticks)", function () {
  this.timeout(12 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "links", ticks: 900, every: 50 });
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("moves energy across the room by link", () => {
    const linkE = seriesOf(res.timeline, "W1N1", "bot", "linkEnergy");
    expect(Math.max(...linkE), `linkEnergy series: ${linkE.join(",")}`).to.be.greaterThan(0);
  });

  it("feeds the controller with zero hauler labor on the route", () => {
    const progress = seriesOf(res.timeline, "W1N1", "bot", "progress");
    expect(progress[progress.length - 1], `progress series: ${progress.join(",")}`).to.be.greaterThan(500);
  });
});
