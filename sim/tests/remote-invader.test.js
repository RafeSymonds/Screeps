"use strict";
const { expect } = require("chai");
const { runScenario, seriesOf, finalOf } = require("../lib/harness");

// Remote threat handling end to end: hostiles camp the remote from tick 0 and age
// out around tick ~250. The empire must PAUSE the remote while they're there (no
// remote miners/reservers marched in blind) and RESUME after a scout re-verifies
// the room is clear — the previously-untested updateRemoteThreat/reactivation path.
//
// 900 ticks: ~250 for the hostiles to expire, up to a scout sweep (~300) to
// re-verify, then remote spawn + travel. See sim/scenarios/remote-invader.js.
describe("sim: remote invader (remote-invader, 900 ticks)", function () {
  this.timeout(18 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "remote-invader", ticks: 900, every: 25 });
  });

  it("never raises an engine-level or bot error", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
  });

  it("keeps the home room alive throughout", () => {
    expect(Math.min(...seriesOf(res.timeline, "W1N1", "bot", "creeps"))).to.be.greaterThan(0);
  });

  it("pauses the remote while hostiles are present (no miners or reservers sent in)", () => {
    const remote = seriesOf(res.timeline, "W2N1", "bot", "roles");
    const hostiles = seriesOf(res.timeline, "W2N1", "bot", "hostiles");
    hostiles.forEach((count, i) => {
      if (count > 0) {
        expect(remote[i].miner || 0, `miner in remote at snapshot ${i} with hostiles`).to.equal(0);
        expect(remote[i].claim || 0, `claimer in remote at snapshot ${i} with hostiles`).to.equal(0);
      }
    });
  });

  it("the hostiles actually age out (scenario precondition)", () => {
    expect(finalOf(res.timeline, "W2N1", "bot").hostiles).to.equal(0);
  });

  it("reactivates the remote after the threat clears (a miner arrives)", () => {
    expect(finalOf(res.timeline, "W2N1", "bot").roles.miner || 0).to.be.greaterThan(0);
  });

  it("keeps CPU within budget across the threat cycle", () => {
    expect(Math.max(...seriesOf(res.timeline, "W1N1", "bot", "cpu"))).to.be.lessThan(50);
  });
});
