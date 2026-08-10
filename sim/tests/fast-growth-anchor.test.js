"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * FAST gate — plan anchoring on a pre-existing base in 400 ticks (the build-out
 * completion proof lives in tests-full/m3-growth). Proves: layout anchors on the
 * existing spawn, construction sequences ≤2 sites, no duplicate producers.
 */
const at = (series, tick, every) => series[Math.min(Math.floor(tick / every) - 1, series.length - 1)];

describe("fast: plan anchoring (growth, 400 ticks)", function () {
  this.timeout(8 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "growth", ticks: 400, every: 25 });
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("anchors the plan on the pre-existing spawn", () => {
    const layout = res.memories.bot.rooms.W1N1.layout;
    expect(layout, "layout slice missing").to.not.equal(undefined);
    expect(layout.anchor).to.equal(25 * 50 + 25);
  });

  it("sequences sites without duplicating the spawn", () => {
    const sites = seriesOf(res.timeline, "W1N1", "bot", "sites");
    const spawns = seriesOf(res.timeline, "W1N1", "bot", "spawns");
    expect(at(sites, 200, 25), `sites series: ${sites.join(",")}`).to.be.at.least(1);
    for (let i = 0; i < sites.length; i++) {
      expect(sites[i], `sites series: ${sites.join(",")}`).to.be.at.most(2);
      expect(spawns[i], `spawns series: ${spawns.join(",")}`).to.equal(1);
    }
  });
});
