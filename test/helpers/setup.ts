/**
 * Mocha root setup (loaded via --require). Defines the subset of Screeps game
 * constants the codebase touches and installs fresh global Game/Memory mocks
 * before every test.
 */
const g = global as unknown as Record<string, unknown>;

// Return codes
g.OK = 0;
g.ERR_NOT_OWNER = -1;
g.ERR_BUSY = -4;
g.ERR_NOT_ENOUGH_ENERGY = -6;
g.ERR_NOT_ENOUGH_RESOURCES = -6;
g.ERR_INVALID_TARGET = -7;
g.ERR_FULL = -8;
g.ERR_NOT_IN_RANGE = -9;

// Body parts + costs
g.MOVE = "move";
g.WORK = "work";
g.CARRY = "carry";
g.ATTACK = "attack";
g.RANGED_ATTACK = "ranged_attack";
g.HEAL = "heal";
g.CLAIM = "claim";
g.TOUGH = "tough";
g.BODYPART_COST = { move: 50, work: 100, carry: 50, attack: 80, ranged_attack: 150, heal: 250, claim: 600, tough: 10 };

// Resources
g.RESOURCE_ENERGY = "energy";

// Economy constants (energy-flow model)
g.SOURCE_ENERGY_CAPACITY = 3000;
g.ENERGY_REGEN_TIME = 300;
g.HARVEST_POWER = 2;
g.CARRY_CAPACITY = 50;
g.UPGRADE_CONTROLLER_POWER = 1;

// Find constants
g.FIND_SOURCES = 105;
g.FIND_HOSTILE_CREEPS = 103;
g.FIND_MY_CREEPS = 102;
g.FIND_MY_SPAWNS = 112;
g.FIND_STRUCTURES = 107;
g.FIND_MY_CONSTRUCTION_SITES = 114;
g.FIND_CONSTRUCTION_SITES = 111;
g.FIND_DROPPED_RESOURCES = 106;
g.FIND_HOSTILE_STRUCTURES = 109;

// Structure types
g.STRUCTURE_SPAWN = "spawn";
g.STRUCTURE_EXTENSION = "extension";
g.STRUCTURE_TOWER = "tower";
g.STRUCTURE_CONTAINER = "container";
g.STRUCTURE_STORAGE = "storage";
g.STRUCTURE_LINK = "link";
g.STRUCTURE_ROAD = "road";
g.STRUCTURE_WALL = "constructedWall";
g.STRUCTURE_RAMPART = "rampart";
g.STRUCTURE_INVADER_CORE = "invaderCore";
g.STRUCTURE_KEEPER_LAIR = "keeperLair";

// Look + terrain
g.LOOK_STRUCTURES = "structure";
g.LOOK_CONSTRUCTION_SITES = "constructionSite";
g.TERRAIN_MASK_WALL = 1;

// Controller structure limits (what base planning reads)
g.CONTROLLER_STRUCTURES = {
    extension: { 0: 0, 1: 0, 2: 5, 3: 10, 4: 20, 5: 30, 6: 40, 7: 50, 8: 60 },
    storage: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 }
};

function freshGame(): void {
    g.Game = {
        time: 1,
        creeps: {},
        rooms: {},
        spawns: {},
        cpu: { bucket: 10000, limit: 20, tickLimit: 500, getUsed: () => 0 },
        getObjectById: () => null
    };
}

function freshMemory(): void {
    g.Memory = { version: 0, jobs: {}, planRuns: {}, creeps: {}, rooms: {} };
}

freshGame();
freshMemory();

// Root hook plugin (mocha loads --require files before its BDD globals exist,
// so a bare beforeEach would be undefined here).
export const mochaHooks = {
    beforeEach(): void {
        freshGame();
        freshMemory();
    }
};
