"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * M6 FAST gate — the claim half of expansion (docs/design/expansion.md): empire
 * signals, expansion scores and picks, a claimer spawns from the sponsor, walks
 * cross-room, and the target's controller becomes ours. The pioneering half (a
 * spawn built from scratch, ~5000 more ticks) lives in tests-full/m6-expand.
 */
describe("m6: claim a second room (expand, 1500 ticks)", function () {
  this.timeout(20 * 60 * 1000);
  let res;
  before(async () => {
    // 1500: income comes first by policy, and the sponsor now staffs FIVE real
    // haulers (undersized adopted bodies no longer count as staffed) before it
    // funds a priority-60 claimer — roughly 200 ticks further right.
    res = await runScenario({ scenario: "expand", ticks: 1500, every: 50 });
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("registers both the sponsor's lifecycle and a claim", () => {
    const empire = res.memories.bot.empire;
    expect(empire, "no empire slice").to.not.equal(undefined);
    expect(empire.rooms.W1N1, "sponsor unregistered").to.not.equal(undefined);
    // Either the claim is still in flight or it already completed and cleared.
    const claimed = res.memories.bot.expansion?.claim !== undefined;
    const ownsTarget = seriesOf(res.timeline, "W2N1", "bot", "rcl").some(r => r > 0);
    expect(claimed || ownsTarget, "expansion never started a claim").to.equal(true);
  });

  it("takes the target's controller", () => {
    const rcl = seriesOf(res.timeline, "W2N1", "bot", "rcl");
    expect(Math.max(...rcl), `W2N1 rcl series: ${rcl.join(",")}`).to.be.at.least(1);
  });

  it("keeps the sponsor healthy while doing it", () => {
    const creeps = seriesOf(res.timeline, "W1N1", "bot", "creeps");
    expect(creeps[creeps.length - 1], `sponsor creeps: ${creeps.join(",")}`).to.be.at.least(5);
    const spawns = seriesOf(res.timeline, "W1N1", "bot", "spawns");
    for (const n of spawns) {
      expect(n).to.be.at.least(1);
    }
  });
});
