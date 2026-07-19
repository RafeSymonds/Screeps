"use strict";
const { expect } = require("chai");
const { runScenario } = require("../lib/harness");

/*
 * Placeholder suite: boots the real engine on the default scenario and asserts
 * the bot bundle loads and ticks without errors. Add behavioral assertions
 * (economy growth, defense, CPU bounds) as the new bot gains capabilities.
 */
describe("sim: smoke (default, 50 ticks)", function () {
  this.timeout(10 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "default", ticks: 50, every: 10 });
  });

  it("runs the bot without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
  });
});
