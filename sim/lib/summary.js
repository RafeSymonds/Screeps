"use strict";
/*
 * Per-room state summary, shared by the runner (human-readable lines) and the test
 * harness (assertion fields), so tests assert on exactly what you watch.
 */

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

/** Reduce a room's raw objects to a flat stats object for one owner (botId). */
function summarize(objects, botId) {
  const mine = (o) => o.user === botId;
  const of = (type) => objects.filter((o) => o.type === type);
  const energyOf = (o) => (o.store && o.store.energy) || 0;
  const sum = (arr, f) => arr.reduce((a, o) => a + (f(o) || 0), 0);

  const creeps = of("creep").filter(mine);
  const hostiles = of("creep").filter((o) => o.user && o.user !== botId);
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
  const dropped = of("energy"); // drop-mined ground piles

  return {
    creeps: creeps.length,
    roles,
    hostiles: hostiles.length,
    spawns: spawns.length,
    spawnEnergy: sum(spawns, energyOf),
    spawning: spawns.filter((s) => s.spawning).length,
    extensions: extensions.length,
    extEnergy: sum(extensions, energyOf),
    towers: towers.length,
    towerEnergy: sum(towers, energyOf),
    containers: containers.length,
    contEnergy: sum(containers, energyOf),
    storageEnergy: sum(storage, energyOf),
    sites: sites.length,
    sourceEnergy: sum(sources, (o) => o.energy || 0),
    droppedEnergy: sum(dropped, (o) => o.energy || 0),
    droppedPiles: dropped.length,
    rcl: controller ? controller.level || 0 : 0,
    progress: controller ? controller.progress || 0 : 0,
    progressTotal: controller ? controller.progressTotal || 0 : 0
  };
}

/** One-line render of a stats object (includes cpu when present). */
function fmtLine(s) {
  const roles = Object.keys(s.roles || {}).length ? JSON.stringify(s.roles) : "{}";
  const rcl = s.progressTotal ? `RCL${s.rcl}(${s.progress}/${s.progressTotal})` : `RCL${s.rcl}(up=${s.progress})`;
  const cpu = s.cpu === undefined ? "" : ` cpu=${typeof s.cpu === "number" ? s.cpu.toFixed(2) : s.cpu}`;
  return (
    `creeps=${s.creeps} ${roles} ` +
    (s.hostiles ? `hostiles=${s.hostiles} ` : "") +
    `${rcl} spawn=${s.spawnEnergy}${s.spawning ? "*" : ""} ` +
    `ext=${s.extensions}/${s.extEnergy} cont=${s.containers}/${s.contEnergy} ` +
    `stor=${s.storageEnergy} towers=${s.towers}/${s.towerEnergy} sites=${s.sites} src=${s.sourceEnergy} ` +
    `drop=${s.droppedPiles || 0}/${s.droppedEnergy || 0}` +
    cpu
  );
}

module.exports = { summarize, classify, fmtLine };
