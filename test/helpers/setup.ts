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
g.ERR_TIRED = -11;

// Directions + body size limit
g.TOP = 1;
g.TOP_RIGHT = 2;
g.RIGHT = 3;
g.BOTTOM_RIGHT = 4;
g.BOTTOM = 5;
g.BOTTOM_LEFT = 6;
g.LEFT = 7;
g.TOP_LEFT = 8;
g.MAX_CREEP_SIZE = 50;

// Minimal RoomPosition + PathFinder stand-ins (movement tests replace search per-test)
g.RoomPosition = class {
    public x: number;
    public y: number;
    public roomName: string;
    public constructor(x: number, y: number, roomName: string) {
        this.x = x;
        this.y = y;
        this.roomName = roomName;
    }
};
class MockCostMatrix {
    private cells = new Map<string, number>();
    public set(x: number, y: number, v: number): void {
        this.cells.set(`${x},${y}`, v);
    }
    public get(x: number, y: number): number {
        return this.cells.get(`${x},${y}`) ?? 0;
    }
    public clone(): MockCostMatrix {
        const copy = new MockCostMatrix();
        copy.cells = new Map(this.cells);
        return copy;
    }
}
function freshPathFinder(): void {
    g.PathFinder = {
        CostMatrix: MockCostMatrix,
        search: () => ({ path: [], ops: 0, cost: 0, incomplete: false })
    };
}
freshPathFinder();

// Body parts + costs
g.MOVE = "move";
g.WORK = "work";
g.CARRY = "carry";
g.ATTACK = "attack";
g.RANGED_ATTACK = "ranged_attack";
g.HEAL = "heal";
g.CLAIM = "claim";
g.RESOURCE_UTRIUM = "U";
g.RESOURCE_LEMERGIUM = "L";
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
g.FIND_MINERALS = 116;

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
g.STRUCTURE_TERMINAL = "terminal";
g.STRUCTURE_LAB = "lab";
g.STRUCTURE_FACTORY = "factory";
g.STRUCTURE_OBSERVER = "observer";
g.STRUCTURE_POWER_SPAWN = "powerSpawn";
g.STRUCTURE_NUKER = "nuker";
g.STRUCTURE_EXTRACTOR = "extractor";

// Look + terrain
g.LOOK_STRUCTURES = "structure";
g.LOOK_CONSTRUCTION_SITES = "constructionSite";
g.TERRAIN_MASK_WALL = 1;
g.TERRAIN_MASK_SWAMP = 2;
g.STRUCTURE_CONTROLLER = "controller";

// Controller structure limits (the real game table, engine-verified)
g.CONTROLLER_STRUCTURES = {
    spawn: { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 2, 8: 3 },
    extension: { 0: 0, 1: 0, 2: 5, 3: 10, 4: 20, 5: 30, 6: 40, 7: 50, 8: 60 },
    container: { 0: 5, 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5, 8: 5 },
    tower: { 0: 0, 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 6 },
    storage: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 },
    link: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 2, 6: 3, 7: 4, 8: 6 },
    terminal: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1 },
    lab: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 3, 7: 6, 8: 10 },
    factory: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 1, 8: 1 },
    observer: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
    powerSpawn: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
    nuker: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 1 },
    extractor: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 1, 7: 1, 8: 1 },
    road: { 0: 2500, 1: 2500, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500 },
    rampart: { 0: 0, 1: 0, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500 },
    constructedWall: { 0: 0, 1: 0, 2: 2500, 3: 2500, 4: 2500, 5: 2500, 6: 2500, 7: 2500, 8: 2500 }
};

function freshGame(): void {
    g.Game = {
        time: 1,
        creeps: {},
        rooms: {},
        spawns: {},
        cpu: { bucket: 10000, limit: 20, tickLimit: 500, getUsed: () => 0 },
        map: { getRoomTerrain: () => ({ get: () => 0 }) },
        notify: () => undefined,
        getObjectById: () => null
    };
}

function freshMemory(): void {
    g.Memory = { creeps: {}, rooms: {} };
}

freshGame();
freshMemory();

// Root hook plugin (mocha loads --require files before its BDD globals exist,
// so a bare beforeEach would be undefined here).
export const mochaHooks = {
    beforeEach(): void {
        freshGame();
        freshMemory();
        freshPathFinder();
    }
};
