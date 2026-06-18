"use strict";
/*
 * Headless simulation runner (human-watchable).
 *
 * Loads the real bundled bot (dist/main.js, mounted at /bot), builds a world from a
 * scenario, runs the actual Screeps engine N ticks, and prints real game state
 * between ticks. For machine-asserted regression checks see sim/tests/ + `bin/sim test`.
 *
 * Env (set by bin/sim):
 *   TICKS, EVERY, SCENARIO, VERBOSE, BOT_MAIN, BOT_MAP
 */
require("./lib/env").applyFixes();

const fs = require("fs");
const path = require("path");
const { ScreepsServer, TerrainMatrix } = require("screeps-server-mockup");
const { summarize, fmtLine } = require("./lib/summary");
const { readBotModules } = require("./lib/harness");
const { seedSurroundingTerrain } = require("./scenarios/_world");

const TICKS = parseInt(process.env.TICKS || "150", 10);
const EVERY = parseInt(process.env.EVERY || "10", 10);
const SCENARIO = process.env.SCENARIO || "default";
const VERBOSE = process.env.VERBOSE === "1";

(async () => {
  if (SCENARIO.startsWith("_")) {
    throw new Error(`"${SCENARIO}" is a helper module, not a scenario (files starting with _ are not selectable)`);
  }
  const scenarioPath = path.join(__dirname, "scenarios", `${SCENARIO}.js`);
  if (!fs.existsSync(scenarioPath)) {
    throw new Error(`unknown scenario "${SCENARIO}" (looked in ${scenarioPath})`);
  }
  const scenario = require(scenarioPath);
  const modules = readBotModules();

  const server = new ScreepsServer();
  console.log(`[sim] node ${process.version} | scenario=${SCENARIO} | ticks=${TICKS} | every=${EVERY}`);

  const ctx = await scenario.setup(server, { TerrainMatrix, modules });
  const rooms = ctx.rooms || (ctx.room ? [ctx.room] : []);
  const bots = ctx.bots || {};
  const botList = Object.entries(bots);
  if (!botList.length) throw new Error("scenario returned no bots");

  // Match production: give neighbor rooms terrain so cross-border pathfinding works.
  await seedSurroundingTerrain(server, rooms);

  const logBuffer = [];
  for (const [name, bot] of botList) {
    bot.on("console", (log) => {
      for (const line of log) logBuffer.push(`    [${name}] ${line}`);
    });
  }

  await server.start();

  for (let i = 1; i <= TICKS; i++) {
    await server.tick();
    const t = await server.world.gameTime;
    const showState = i === 1 || i === TICKS || i % EVERY === 0;
    const showConsole = VERBOSE || showState || i <= 3;

    if (logBuffer.length && showConsole) {
      console.log(`  -- tick ${t} console --`);
      for (const l of logBuffer) console.log(l);
    }
    logBuffer.length = 0;

    for (const [name, bot] of botList) {
      const notifs = await bot.newNotifications;
      for (const n of notifs) console.log(`  [${name} ENGINE] ${n.message}`);
    }

    if (showState) {
      for (const room of rooms) {
        const objects = await server.world.roomObjects(room);
        for (const [name, bot] of botList) {
          const stats = summarize(objects, bot.id);
          stats.cpu = await bot.lastUsedCpu;
          console.log(`[t${String(t).padStart(4)}] ${room}/${name}: ${fmtLine(stats)}`);
        }
      }
    }
  }

  if (VERBOSE) {
    for (const [name, bot] of botList) {
      console.log(`  -- ${name} Memory --`);
      console.log("  " + (await bot.memory));
    }
  }

  console.log("[sim] done");
  server.stop();
  setTimeout(() => process.exit(0), 500);
})().catch((e) => {
  console.error("[sim] FAILED:", (e && e.stack) || e);
  setTimeout(() => process.exit(1), 500);
});
