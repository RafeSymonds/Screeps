"use strict";
/*
 * Shared world-builder helpers for scenarios.  NOT a scenario itself (the leading
 * underscore keeps it out of `--scenario` selection).
 *
 * Every structure/creep shape here mirrors what @screeps/engine actually writes
 * (see processor/intents/creeps/build.js and spawns/create-creep.js), so the
 * objects behave identically to ones the engine would create. All capacities and
 * hits are read from the live engine constants (`server.constants`), never hard-coded.
 *
 * Typical scenario:
 *   const W = require("./_world");
 *   await W.resetWorld(server);
 *   await W.freshRoom(server, room);
 *   await W.addSource(server, room, 10, 40);
 *   await W.addController(server, room, 25, 18);
 *   const bot = await server.world.addBot({ username: "bot", room, x: 25, y: 25, modules });
 *   await W.fullBase(server, room, bot.id, { center: { x: 25, y: 25 } });
 */
const { TerrainMatrix } = require("screeps-server-mockup");

async function store(server) {
  if (!server.connected) await server.connect();
  return server.common.storage;
}

/** Reset to a barren world (keeps Invader + Source Keeper NPC users). */
async function resetWorld(server) {
  await server.world.reset();
}

/** Add a room with terrain (defaults to all-plains). */
async function freshRoom(server, room, terrain) {
  await server.world.addRoom(room);
  await server.world.setTerrain(room, terrain || new TerrainMatrix());
}

// --- Neighbor terrain seeding ---------------------------------------------
// The real Screeps map has terrain for *every* room, so PathFinder may freely
// probe a room's neighbors. The mockup only stores terrain for rooms a scenario
// explicitly adds, so a normal in-room `moveTo` whose path search peeks across a
// room border hits "Could not load terrain data". We seed all-plains terrain for
// the rooms surrounding each scenario room so the engine matches production and
// the bot's movement primitive can stay standard (and multi-room capable).

/** Parse "W1N1" -> signed {x,y}, matching @screeps/common roomNameToXY. */
function roomNameToXY(name) {
  const m = /^([WE])(\d+)([NS])(\d+)$/.exec(name);
  if (!m) return null;
  const x = m[1] === "W" ? -parseInt(m[2], 10) - 1 : parseInt(m[2], 10);
  const y = m[3] === "N" ? -parseInt(m[4], 10) - 1 : parseInt(m[4], 10);
  return { x, y };
}

/** Inverse of roomNameToXY. */
function xyToRoomName(x, y) {
  const h = x < 0 ? `W${-x - 1}` : `E${x}`;
  const v = y < 0 ? `N${-y - 1}` : `S${y}`;
  return `${h}${v}`;
}

/**
 * Add empty all-plains terrain for every room within `radius` of each given room
 * that isn't already part of the world. Idempotent; safe to call once after a
 * scenario's own rooms (with their real terrain) are set up.
 */
async function seedSurroundingTerrain(server, rooms, radius = 2) {
  const existing = new Set(rooms);
  const seeded = new Set();
  for (const room of rooms) {
    const center = roomNameToXY(room);
    if (!center) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const name = xyToRoomName(center.x + dx, center.y + dy);
        if (existing.has(name) || seeded.has(name)) continue;
        seeded.add(name);
        await server.world.addRoom(name);
        await server.world.setTerrain(name, new TerrainMatrix());
      }
    }
  }
}

async function addController(server, room, x, y, level = 0) {
  return server.world.addRoomObject(room, "controller", x, y, { level });
}

async function addSource(server, room, x, y, opts = {}) {
  return server.world.addRoomObject(room, "source", x, y, {
    energy: opts.energy ?? 3000,
    energyCapacity: opts.capacity ?? 3000,
    ticksToRegeneration: 300
  });
}

async function addMineral(server, room, x, y, opts = {}) {
  return server.world.addRoomObject(room, "mineral", x, y, {
    mineralType: opts.mineralType || "H",
    density: opts.density ?? 3,
    mineralAmount: opts.amount ?? 50000
  });
}

/** Create a non-bot user (e.g. an enemy) with no code. Returns the user id. */
async function addUser(server, username, opts = {}) {
  const { db, env } = await store(server);
  const user = await db.users.insert({
    username,
    cpu: opts.cpu ?? 100,
    cpuAvailable: 10000,
    gcl: opts.gcl ?? 1,
    active: opts.active ?? 0,
    badge: server.world.genRandomBadge()
  });
  await env.set(env.keys.MEMORY + user._id, "{}");
  return user._id;
}

/** Force an existing room controller to a given level/owner. */
async function setController(server, room, user, level, opts = {}) {
  const { db } = await store(server);
  const data = await db["rooms.objects"].findOne({ room, type: "controller" });
  if (!data) throw new Error(`setController: no controller in ${room}`);
  await db["rooms.objects"].update(
    { _id: data._id },
    {
      $set: {
        user,
        level,
        progress: opts.progress ?? 0,
        downgradeTime: opts.downgradeTime ?? 1e12,
        safeMode: opts.safeMode ?? null,
        safeModeAvailable: opts.safeModeAvailable ?? 0,
        safeModeCooldown: opts.safeModeCooldown ?? null
      }
    }
  );
}

// Owned-structure attribute tables, mirroring @screeps/engine build.js exactly.
function structureAttrs(C, type, opts = {}) {
  const { user, level = 8 } = opts;
  const a = { notifyWhenAttacked: true };
  // default: fill energy stores to capacity unless an explicit amount is given
  const fill = (cap) => (opts.energy === undefined ? cap : Math.min(opts.energy, cap));
  switch (type) {
    case "spawn":
      return Object.assign(a, { user, store: { energy: fill(C.SPAWN_ENERGY_CAPACITY) }, storeCapacityResource: { energy: C.SPAWN_ENERGY_CAPACITY }, hits: C.SPAWN_HITS, hitsMax: C.SPAWN_HITS });
    case "extension": {
      const cap = C.EXTENSION_ENERGY_CAPACITY[level];
      return Object.assign(a, { user, store: { energy: fill(cap) }, storeCapacityResource: { energy: cap }, hits: C.EXTENSION_HITS, hitsMax: C.EXTENSION_HITS });
    }
    case "tower":
      return Object.assign(a, { user, store: { energy: fill(C.TOWER_CAPACITY) }, storeCapacityResource: { energy: C.TOWER_CAPACITY }, hits: C.TOWER_HITS, hitsMax: C.TOWER_HITS });
    case "link":
      return Object.assign(a, { user, cooldown: 0, store: { energy: fill(C.LINK_CAPACITY) }, storeCapacityResource: { energy: C.LINK_CAPACITY }, hits: C.LINK_HITS, hitsMax: C.LINK_HITS_MAX });
    case "storage":
      return Object.assign(a, { user, store: { energy: opts.energy ?? Math.floor(C.STORAGE_CAPACITY / 2) }, storeCapacity: C.STORAGE_CAPACITY, hits: C.STORAGE_HITS, hitsMax: C.STORAGE_HITS });
    case "terminal":
      return Object.assign(a, { user, store: { energy: opts.energy ?? Math.floor(C.TERMINAL_CAPACITY / 10) }, storeCapacity: C.TERMINAL_CAPACITY, hits: C.TERMINAL_HITS, hitsMax: C.TERMINAL_HITS });
    case "container":
      return Object.assign(a, { store: { energy: fill(C.CONTAINER_CAPACITY) }, storeCapacity: C.CONTAINER_CAPACITY, hits: C.CONTAINER_HITS, hitsMax: C.CONTAINER_HITS, nextDecayTime: 1e12 });
    case "lab":
      return Object.assign(a, { user, mineralAmount: 0, cooldown: 0, store: { energy: fill(C.LAB_ENERGY_CAPACITY) }, storeCapacity: C.LAB_ENERGY_CAPACITY + C.LAB_MINERAL_CAPACITY, storeCapacityResource: { energy: C.LAB_ENERGY_CAPACITY }, hits: C.LAB_HITS, hitsMax: C.LAB_HITS });
    case "rampart": {
      const hm = C.RAMPART_HITS_MAX[level] || C.RAMPART_HITS;
      return Object.assign(a, { user, hits: opts.hits ?? hm, hitsMax: hm, nextDecayTime: 1e12 });
    }
    case "constructedWall":
      return Object.assign(a, { hits: opts.hits ?? 1000000, hitsMax: C.WALL_HITS_MAX });
    case "road":
      return Object.assign(a, { hits: C.ROAD_HITS, hitsMax: C.ROAD_HITS, nextDecayTime: 1e12 });
    case "extractor":
      return Object.assign(a, { user, hits: C.EXTRACTOR_HITS, hitsMax: C.EXTRACTOR_HITS });
    case "observer":
      return Object.assign(a, { user, hits: C.OBSERVER_HITS, hitsMax: C.OBSERVER_HITS });
    case "powerSpawn":
      return Object.assign(a, { user, store: { energy: fill(C.POWER_SPAWN_ENERGY_CAPACITY) }, storeCapacityResource: { energy: C.POWER_SPAWN_ENERGY_CAPACITY, power: C.POWER_SPAWN_POWER_CAPACITY }, hits: C.POWER_SPAWN_HITS, hitsMax: C.POWER_SPAWN_HITS });
    case "factory":
      return Object.assign(a, { user, store: { energy: fill(C.FACTORY_CAPACITY) }, storeCapacity: C.FACTORY_CAPACITY, hits: C.FACTORY_HITS, hitsMax: C.FACTORY_HITS, cooldown: 0 });
    case "nuker":
      return Object.assign(a, { user, store: { energy: fill(C.NUKER_ENERGY_CAPACITY) }, storeCapacityResource: { energy: C.NUKER_ENERGY_CAPACITY, G: C.NUKER_GHODIUM_CAPACITY }, hits: C.NUKER_HITS, hitsMax: C.NUKER_HITS, cooldownTime: 0 });
    default:
      throw new Error(`structureAttrs: unsupported type "${type}"`);
  }
}

/** Place one structure with engine-correct attributes. */
async function addStructure(server, room, type, x, y, opts = {}) {
  const attrs = structureAttrs(server.constants, type, opts);
  if (opts.name) attrs.name = opts.name;
  return server.world.addRoomObject(room, type, x, y, attrs);
}

/** Place a live creep (engine-correct shape). body is an array of part constants. */
async function addCreep(server, room, x, y, user, body, opts = {}) {
  const C = server.constants;
  const gt = await server.world.gameTime;
  let storeCapacity = 0;
  const parts = body.map((t) => {
    if (t === C.CARRY) storeCapacity += C.CARRY_CAPACITY;
    return { type: t, hits: 100 };
  });
  return server.world.addRoomObject(room, "creep", x, y, {
    name: opts.name || `c_${user}_${x}_${y}`,
    body: parts,
    store: opts.store || { energy: 0 },
    storeCapacity,
    user,
    hits: parts.length * 100,
    hitsMax: parts.length * 100,
    spawning: false,
    fatigue: 0,
    ageTime: (opts.ageTime ?? gt + C.CREEP_LIFE_TIME),
    notifyWhenAttacked: true
  });
}

/** Hands out distinct free tiles in a box; checkerboard mode leaves walkable gaps. */
class Placer {
  constructor(box, opts = {}) {
    this.box = box;
    this.checker = !!opts.checkerboard;
    this.used = new Set((opts.used || []).map((p) => `${p.x},${p.y}`));
    this.x = box.x1;
    this.y = box.y1;
  }
  take() {
    for (; this.y <= this.box.y2; this.y++, this.x = this.box.x1) {
      for (; this.x <= this.box.x2; this.x++) {
        const x = this.x;
        const y = this.y;
        if (x < 2 || x > 47 || y < 2 || y > 47) continue;
        if (this.checker && (x + y) % 2 !== 0) continue;
        const k = `${x},${y}`;
        if (this.used.has(k)) continue;
        this.used.add(k);
        this.x++;
        return { x, y };
      }
    }
    throw new Error(`Placer: out of free tiles in ${JSON.stringify(this.box)}`);
  }
}

/**
 * Build a mature owned base around `center`: controller to `level`, the full
 * structure allotment for that RCL (capped to keep the room walkable), all energy
 * stores filled, plus a starting workforce. Assumes addBot already placed Spawn1
 * at `center` and claimed the controller. Returns a summary.
 */
async function fullBase(server, room, user, opts = {}) {
  const C = server.constants;
  const level = opts.level ?? 8;
  const center = opts.center || { x: 25, y: 25 };
  const cs = C.CONTROLLER_STRUCTURES;

  await setController(server, room, user, level, { safeMode: opts.safeMode });

  const existing = await server.world.roomObjects(room);
  const reserved = existing.map((o) => ({ x: o.x, y: o.y }));
  const box = { x1: center.x - 8, y1: center.y - 8, x2: center.x + 8, y2: center.y + 8 };
  const p = new Placer(box, { checkerboard: true, used: reserved });

  const place = async (type, count, o = {}) => {
    for (let i = 0; i < count; i++) {
      const t = p.take();
      await addStructure(server, room, type, t.x, t.y, { user, level, ...o });
    }
  };

  const spawns = Math.min(cs.spawn[level] || 1, 3);
  for (let i = 2; i <= spawns; i++) await place("spawn", 1, { name: `Spawn${i}` });
  await place("extension", cs.extension[level] || 0);
  await place("tower", cs.tower[level] || 0);
  if (cs.storage[level]) await place("storage", 1);
  if (cs.terminal[level]) await place("terminal", 1);
  await place("link", Math.min(cs.link[level] || 0, 4));
  await place("lab", Math.min(cs.lab[level] || 0, 4));

  // Workforce on the walkable (odd) tiles between structures.
  const creeps = opts.creeps ?? 8;
  const body = opts.body || [C.WORK, C.WORK, C.CARRY, C.CARRY, C.MOVE, C.MOVE];
  const cp = new Placer(box, { checkerboard: false, used: [...reserved] });
  for (let i = 0; i < creeps; i++) {
    const t = cp.take();
    await addCreep(server, room, t.x, t.y, user, body, { name: `bot_w${i}`, store: { energy: 0 } });
  }

  return { level, spawns, extensions: cs.extension[level], towers: cs.tower[level], creeps };
}

/** Drop hostile creeps owned by `user` near a position (defaults to attackers). */
async function addHostiles(server, room, user, count, opts = {}) {
  const C = server.constants;
  const near = opts.near || { x: 25, y: 25 };
  const body = opts.body || [C.TOUGH, C.TOUGH, C.MOVE, C.MOVE, C.ATTACK, C.ATTACK];
  const box = { x1: near.x - 3, y1: near.y - 3, x2: near.x + 3, y2: near.y + 3 };
  const p = new Placer(box, {});
  const placed = [];
  for (let i = 0; i < count; i++) {
    const t = p.take();
    placed.push(await addCreep(server, room, t.x, t.y, user, body, { name: `enemy_${i}` }));
  }
  return placed;
}

module.exports = {
  TerrainMatrix,
  resetWorld,
  freshRoom,
  seedSurroundingTerrain,
  addController,
  addSource,
  addMineral,
  addUser,
  setController,
  structureAttrs,
  addStructure,
  addCreep,
  Placer,
  fullBase,
  addHostiles
};
