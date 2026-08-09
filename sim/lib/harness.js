"use strict";
/*
 * Programmatic driver used by the behavioral tests (sim/tests/*.test.js).
 *
 * runScenario() boots the real engine, applies a scenario, ticks N times, and
 * returns a timeline of per-tick state snapshots plus any console output and
 * engine-level errors — so tests can assert on long-term behavior. Each call uses
 * a fresh storage port so sequential runs never collide.
 */
require("./env").applyFixes();

const fs = require("fs");
const path = require("path");
const { ScreepsServer, TerrainMatrix } = require("screeps-server-mockup");
const { summarize } = require("./summary");
const { seedSurroundingTerrain } = require("../scenarios/_world");

// Per-process base port so `mocha --parallel` workers never collide on storage
// ports/dirs (each worker is a separate process with its own counter).
let nextPort = 21025 + (process.pid % 1000) * 4;

function readBotModules(botMain, botMap) {
  botMain = botMain || process.env.BOT_MAIN || "/bot/main.js";
  botMap = botMap || process.env.BOT_MAP || "/bot/main.js.map.js";
  if (!fs.existsSync(botMain)) {
    throw new Error(`bot bundle not found at ${botMain} — run \`npm run build\` first`);
  }
  const modules = { main: fs.readFileSync(botMain, "utf8") };
  if (fs.existsSync(botMap)) modules["main.js.map"] = fs.readFileSync(botMap, "utf8");
  return modules;
}

/**
 * @param {object} opts
 * @param {string} [opts.scenario]  name under sim/scenarios (or pass opts.setup)
 * @param {function} [opts.setup]   inline setup(server, { TerrainMatrix, modules })
 * @param {number} [opts.ticks=100]
 * @param {number} [opts.every=1]   snapshot cadence
 * @returns {Promise<{timeline, consoleLines, notifications, engineErrors, botErrors, memories}>}
 *          memories = each bot's final parsed Memory (null if unreadable), so
 *          tests can assert on persisted state (versioning, telemetry ring, …).
 */
async function runScenario(opts = {}) {
  const { scenario, setup, ticks = 100, every = 1 } = opts;
  const port = opts.port || nextPort++;
  // Isolate each run's storage dir + port so sequential runs never collide.
  const base = path.resolve(process.cwd(), `server-${port}`);
  const server = new ScreepsServer({
    port,
    path: base,
    logdir: path.join(base, "logs"),
    modfile: path.join(base, "mods.json")
  });
  const modules = readBotModules();

  const scen = setup ? { setup } : require(path.join(__dirname, "..", "scenarios", `${scenario}.js`));
  const ctx = await scen.setup(server, { TerrainMatrix, modules });
  const rooms = ctx.rooms || (ctx.room ? [ctx.room] : []);
  const bots = ctx.bots || {};
  const botList = Object.entries(bots);
  if (!botList.length) throw new Error("scenario returned no bots");

  // Match production: give neighbor rooms terrain so cross-border pathfinding works.
  await seedSurroundingTerrain(server, rooms);

  const consoleLines = [];
  const notifications = [];
  for (const [name, bot] of botList) {
    bot.on("console", (log) => {
      for (const l of log) consoleLines.push({ name, line: l });
    });
  }

  await server.start();

  const timeline = [];
  const memories = {};
  try {
    for (let i = 1; i <= ticks; i++) {
      await server.tick();
      const t = await server.world.gameTime;

      for (const [name, bot] of botList) {
        const notifs = await bot.newNotifications;
        for (const n of notifs) notifications.push({ name, t, message: n.message });
      }

      if (every === 1 || i % every === 0 || i === ticks) {
        const snap = { t, rooms: {} };
        for (const room of rooms) {
          const objs = await server.world.roomObjects(room);
          snap.rooms[room] = {};
          for (const [name, bot] of botList) {
            const stats = summarize(objs, bot.id);
            stats.cpu = await bot.lastUsedCpu;
            snap.rooms[room][name] = stats;
          }
        }
        timeline.push(snap);
      }
    }

    for (const [name, bot] of botList) {
      try {
        memories[name] = JSON.parse(await bot.memory);
      } catch (_) {
        memories[name] = null;
      }
    }
  } finally {
    try {
      server.stop();
    } catch (_) {
      /* ignore */
    }
  }

  // Exceptions the bot caught itself surface as ErrorMapper red-span console lines.
  const botErrors = consoleLines.filter((c) => typeof c.line === "string" && c.line.includes("color:red"));

  // The engine notifies for informational game events too (controller upgraded,
  // creep attacked, ...); only error-shaped notifications count as failures.
  const engineErrors = notifications.filter((n) => /error|exception/i.test(n.message));

  return { timeline, consoleLines, notifications, engineErrors, botErrors, memories };
}

/** timeline -> array of one stat field over time, for a given room/bot. */
function seriesOf(timeline, room, bot, key) {
  return timeline.map((s) => (s.rooms[room] && s.rooms[room][bot] ? s.rooms[room][bot][key] : undefined));
}

/** last snapshot's stats for a room/bot. */
function finalOf(timeline, room, bot) {
  const last = timeline[timeline.length - 1];
  return last.rooms[room][bot];
}

module.exports = { runScenario, readBotModules, seriesOf, finalOf };
