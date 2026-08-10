"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * M6 FULL gate — the whole expansion arc (docs/design/expansion.md): claim, then
 * pioneers harvest/build the new room's first spawn from nothing, then the room
 * joins the empire and spawns its own creep on the normal per-room stack.
 *
 * Budget from the review's arithmetic: pioneer cycle = 70 + 4d ticks per 200
 * progress against a 15,000-energy spawn ⇒ 2750–4250 ticks of building, plus
 * ~400 of overhead, ~8% generational turnover, and ~200 for the new spawn's
 * 1/tick energy regen to reach MINER_MIN_BODY's 200.
 */
describe("m6: full expansion arc (expand, 6000 ticks)", function () {
  this.timeout(120 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "expand", ticks: 6000, every: 100 });
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("claims the target", () => {
    const rcl = seriesOf(res.timeline, "W2N1", "bot", "rcl");
    expect(Math.max(...rcl), `W2N1 rcl series: ${rcl.join(",")}`).to.be.at.least(1);
  });

  it("plans and places the new room's spawn site", () => {
    // layout's no-spawn anchor branch and construction's spawnless exception
    // both run live for the first time here.
    const layout = res.memories.bot.rooms.W2N1?.layout;
    expect(layout, "W2N1 never planned").to.not.equal(undefined);
    expect(layout.anchor).to.be.at.least(0);
    const sites = seriesOf(res.timeline, "W2N1", "bot", "sites");
    expect(Math.max(...sites), `W2N1 sites series: ${sites.join(",")}`).to.be.at.least(1);
  });

  it("builds the spawn with pioneers", () => {
    const spawns = seriesOf(res.timeline, "W2N1", "bot", "spawns");
    expect(Math.max(...spawns), `W2N1 spawns series: ${spawns.join(",")}`).to.be.at.least(1);
  });

  it("hands the room to the normal stack — it spawns its own creep", () => {
    // Creeps homed to W2N1 come from W2N1's own spawn: pioneers are homed to the
    // sponsor, so a W2N1-homed creep is the "room joined the empire" moment.
    const homed = Object.values(res.memories.bot.creeps ?? {}).filter(c => c.home === "W2N1");
    expect(homed.length, `creep homes: ${JSON.stringify(res.memories.bot.creeps)}`).to.be.at.least(1);
  });

  it("never lets the sponsor collapse", () => {
    const creeps = seriesOf(res.timeline, "W1N1", "bot", "creeps");
    for (let i = Math.floor(1000 / 100); i < creeps.length; i++) {
      expect(creeps[i], `sponsor creeps: ${creeps.join(",")}`).to.be.at.least(5);
    }
  });
});
