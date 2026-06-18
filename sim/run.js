"use strict";
/*
 * Headless simulation harness.
 *
 * Loads the real bundled bot (dist/main.js, mounted at /bot), builds a world from
 * a scenario, runs the actual Screeps engine N ticks, and prints real game state
 * between ticks: creep population, RCL progress, energy, structures, per-tick CPU,
 * the bot's console output, and any engine-level errors.
 *
 * Configured entirely via env vars (bin/sim sets them):
 *   TICKS     how many ticks to run                 (default 150)
 *   EVERY     print a room state line every N ticks (default 10)
 *   SCENARIO  scenarios/<name>.js                   (default "default")
 *   VERBOSE   "1" => print console every tick + final Memory dump
 *   BOT_MAIN  path to the bundled bot               (default /bot/main.js)
 *   BOT_MAP   path to the bundled source map        (default /bot/main.js.map.js)
 */
const fs = require("fs");
const path = require("path");

// --- Node 24 localhost fix (must run before the storage process is forked) ---
// @screeps/storage binds `listen(PORT, 'localhost')` while @screeps/driver dials
// `net.connect(PORT, STORAGE_HOST)`. On Node 17+, `localhost` resolves to IPv6
// (::1) first, so storage binds ::1 but the driver hits 127.0.0.1 -> ECONNREFUSED
// forever. The mockup forks storage with a replaced env (we can't pass it
// STORAGE_HOST), so we force `localhost` -> IPv4 for every process in this
// container by rewriting /etc/hosts in place, and pin the driver's dial host.
(function forceIpv4Localhost() {
  try {
    const hosts = fs.readFileSync("/etc/hosts", "utf8");
    const patched = hosts.replace(/^::1[ \t]+.*localhost.*$/m, "::1 ip6-localhost ip6-loopback");
    if (patched !== hosts) fs.writeFileSync("/etc/hosts", patched);
  } catch (e) {
    console.warn("[sim] could not patch /etc/hosts for IPv4 localhost:", e.message);
  }
  process.env.STORAGE_HOST = process.env.STORAGE_HOST || "127.0.0.1";
})();

const { ScreepsServer, TerrainMatrix } = require("screeps-server-mockup");

const TICKS = parseInt(process.env.TICKS || "150", 10);
const EVERY = parseInt(process.env.EVERY || "10", 10);
const SCENARIO = process.env.SCENARIO || "default";
const VERBOSE = process.env.VERBOSE === "1";
const BOT_MAIN = process.env.BOT_MAIN || "/bot/main.js";
const BOT_MAP = process.env.BOT_MAP || "/bot/main.js.map.js";

function readBotModules() {
  if (!fs.existsSync(BOT_MAIN)) {
    throw new Error(`bot bundle not found at ${BOT_MAIN} — run \`npm run build\` first`);
  }
  const modules = { main: fs.readFileSync(BOT_MAIN, "utf8") };
  // ErrorMapper lazily require()s "main.js.map" on the first thrown error; provide
  // it so stack traces map back to TypeScript instead of throwing a second error.
  if (fs.existsSync(BOT_MAP)) {
    modules["main.js.map"] = fs.readFileSync(BOT_MAP, "utf8");
  }
  return modules;
}

const partType = (b) => (typeof b === "string" ? b : b && b.type);

function classify(creep) {
  const parts = (creep.body || []).map(partType);
  if (parts.includes("attack") || parts.includes("ranged_attack") || parts.includes("heal")) return "combat";
  if (parts.includes("claim")) return "claim";
  if (parts.includes("work") && parts.includes("carry")) return "worker";
  if (parts.includes("work")) return "miner";
  if (parts.includes("carry")) return "hauler";
  return "other";
}

function summarizeRoom(objects, botId) {
  const mine = (o) => o.user === botId;
  const of = (type) => objects.filter((o) => o.type === type);
  const energyOf = (o) => (o.store && o.store.energy) || 0;
  const sum = (arr, f) => arr.reduce((a, o) => a + (f(o) || 0), 0);

  const creeps = of("creep").filter(mine);
  const roles = {};
  for (const c of creeps) roles[classify(c)] = (roles[classify(c)] || 0) + 1;

  const spawns = of("spawn").filter(mine);
  const extensions = of("extension").filter(mine);
  const towers = of("tower").filter(mine);
  const containers = of("container");
  const storage = of("storage").filter(mine);
  const sites = of("constructionSite").filter(mine);
  const sources = of("source");
  const controller = of("controller")[0];

  return {
    creeps: creeps.length,
    roles,
    spawnEnergy: sum(spawns, energyOf),
    spawning: spawns.filter((s) => s.spawning).length,
    extensions: extensions.length,
    extEnergy: sum(extensions, energyOf),
    towers: towers.length,
    containers: containers.length,
    contEnergy: sum(containers, energyOf),
    storageEnergy: sum(storage, energyOf),
    sites: sites.length,
    sourceEnergy: sum(sources, (o) => o.energy || 0),
    rcl: controller ? controller.level || 0 : 0,
    progress: controller ? controller.progress || 0 : 0,
    progressTotal: controller ? controller.progressTotal || 0 : 0
  };
}

function fmt(s) {
  const roles = Object.keys(s.roles).length ? JSON.stringify(s.roles) : "{}";
  return (
    `creeps=${s.creeps} ${roles} ` +
    `RCL${s.rcl}(${s.progress}/${s.progressTotal}) ` +
    `spawn=${s.spawnEnergy}${s.spawning ? "*" : ""} ` +
    `ext=${s.extensions}/${s.extEnergy} cont=${s.containers}/${s.contEnergy} ` +
    `stor=${s.storageEnergy} towers=${s.towers} sites=${s.sites} src=${s.sourceEnergy}`
  );
}

(async () => {
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

  // Buffer console output per tick and flush under each tick header.
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

    // Engine-level problems (e.g. the main module failing to load) surface here,
    // not in console — always report them.
    for (const [name, bot] of botList) {
      const notifs = await bot.newNotifications;
      for (const n of notifs) console.log(`  [${name} ENGINE] ${n.message}`);
    }

    if (showState) {
      for (const room of rooms) {
        const objects = await server.world.roomObjects(room);
        for (const [name, bot] of botList) {
          const cpu = await bot.lastUsedCpu;
          const cpuStr = typeof cpu === "number" ? cpu.toFixed(2) : String(cpu);
          console.log(`[t${String(t).padStart(4)}] ${room}/${name}: ${fmt(summarizeRoom(objects, bot.id))} cpu=${cpuStr}`);
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
