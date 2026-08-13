"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf } = require("../lib/harness");

/*
 * M5 gate — the remote pause/resume cycle: camped hostiles (expiring ~t900) are
 * sighted, the remote flags unsafe, no remote workforce commits while the
 * sighting is fresh, and mining resumes after they age out.
 */
describe("m5: remote invader pause/resume (remote-invader, 1800 ticks)", function () {
  this.timeout(25 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "remote-invader", ticks: 1800, every: 50 });
  });

  it("runs without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.runtimeKills, JSON.stringify(res.runtimeKills)).to.have.length(0);
    expect(res.memories.bot.stats.counters.errors).to.equal(0);
  });

  it("records the threat", () => {
    const intel = res.memories.bot.intel.rooms.W2N1;
    expect(intel, "no intel for W2N1").to.not.equal(undefined);
    expect(intel.hostiles, "hostiles never recorded").to.not.equal(undefined);
  });

  it("holds off while hostiles camp, then works the remote", () => {
    const remoteCreeps = seriesOf(res.timeline, "W2N1", "bot", "creeps");
    const hostiles = seriesOf(res.timeline, "W2N1", "bot", "hostiles");
    // While armed hostiles stand in W2N1, at most a passing scout is there.
    for (let i = 0; i < hostiles.length; i++) {
      if (hostiles[i] > 0) {
        expect(remoteCreeps[i], `snapshot ${i}: creeps=${remoteCreeps.join(",")} hostiles=${hostiles.join(",")}`).to.be.at.most(1);
      }
    }
    // After expiry (+unsafe memory), the workforce arrives.
    expect(Math.max(...remoteCreeps.slice(Math.floor(1400 / 50))), `W2N1 creeps series: ${remoteCreeps.join(",")}`).to.be.at.least(2);
  });
});
