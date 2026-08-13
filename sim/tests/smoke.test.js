"use strict";
const { expect } = require("chai");
const { runScenario } = require("../lib/harness");

/*
 * M1 milestone gate (docs/design/shell.md test plan): the skeleton bot ticks
 * cleanly in the real engine, persists versioned Memory, and telemetry records
 * per-entry CPU into the stats ring with no errors.
 */
describe("sim: M1 skeleton (default, 200 ticks)", function () {
  this.timeout(10 * 60 * 1000);
  let res;
  let mem;
  before(async () => {
    res = await runScenario({ scenario: "default", ticks: 200, every: 50 });
    mem = res.memories.bot;
  });

  it("runs the bot without engine or bot errors", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.runtimeKills, JSON.stringify(res.runtimeKills)).to.have.length(0);
  });

  it("persists versioned memory with the shell's containers", () => {
    expect(mem, "bot memory should be readable").to.be.an("object");
    expect(mem.version).to.equal(1);
    expect(mem.rooms).to.be.an("object");
    expect(mem.intel).to.be.an("object");
    expect(mem.shell).to.be.an("object");
    expect(mem.shell.owned).to.have.length(1);
  });

  it("records telemetry windows with sane per-entry cpu and zero errors", () => {
    expect(mem.stats, "telemetry slice").to.be.an("object");
    expect(mem.stats.counters.errors).to.equal(0);
    expect(mem.stats.counters.resets).to.be.at.least(1);
    expect(mem.stats.ring.length, "at least one flushed window").to.be.at.least(1);
    for (const w of mem.stats.ring) {
      expect(w.entries, JSON.stringify(w)).to.have.property("shell");
      expect(w.entries).to.have.property("snapshot");
      // Provisional sanity bound for an empty M1 bot; tightened once real numbers exist.
      expect(w.avgCpu, JSON.stringify(w)).to.be.below(5);
    }
    const flushed = mem.stats.ring.some((w) => w.entries.telemetryFlush);
    expect(flushed, "telemetryFlush meters itself").to.equal(true);
  });
});

describe("sim: M1 skeleton (wiped-base, 50 ticks)", function () {
  this.timeout(10 * 60 * 1000);
  let res;
  before(async () => {
    res = await runScenario({ scenario: "wiped-base", ticks: 50, every: 10 });
  });

  it("ticks cleanly with structures but zero creeps", () => {
    expect(res.engineErrors, JSON.stringify(res.engineErrors)).to.have.length(0);
    expect(res.botErrors, JSON.stringify(res.botErrors)).to.have.length(0);
    expect(res.runtimeKills, JSON.stringify(res.runtimeKills)).to.have.length(0);
    const mem = res.memories.bot;
    expect(mem.version).to.equal(1);
    expect(mem.stats.counters.errors).to.equal(0);
  });
});
