import chai from "chai";
import sinonChai from "sinon-chai";

chai.use(sinonChai);

const globalAny = global as typeof global & Record<string, any>;

globalAny._ = require("lodash");
globalAny.OK = 0;
globalAny.TERRAIN_MASK_WALL = 1;
globalAny.MAX_CONSTRUCTION_SITES = 100;
globalAny.RESOURCE_ENERGY = "energy";
globalAny.WORK = "work";
globalAny.CARRY = "carry";
globalAny.MOVE = "move";
globalAny.FIND_MY_SPAWNS = 1;
globalAny.FIND_SOURCES = 2;
globalAny.FIND_CONSTRUCTION_SITES = 3;
globalAny.FIND_MY_STRUCTURES = 4;
globalAny.FIND_STRUCTURES = 5;
globalAny.FIND_DROPPED_RESOURCES = 6;
globalAny.FIND_TOMBSTONES = 7;
globalAny.FIND_RUINS = 8;
globalAny.FIND_MINERALS = 9;
globalAny.LOOK_STRUCTURES = "structure";
globalAny.LOOK_CONSTRUCTION_SITES = "constructionSite";
globalAny.LOOK_TERRAIN = "terrain";
globalAny.TOP = 1;
globalAny.RIGHT = 3;
globalAny.BOTTOM = 5;
globalAny.LEFT = 7;
globalAny.STRUCTURE_SPAWN = "spawn";
globalAny.STRUCTURE_EXTENSION = "extension";
globalAny.STRUCTURE_STORAGE = "storage";
globalAny.STRUCTURE_TOWER = "tower";
globalAny.STRUCTURE_CONTAINER = "container";
globalAny.STRUCTURE_ROAD = "road";
globalAny.STRUCTURE_INVADER_CORE = "invaderCore";
globalAny.STRUCTURE_KEEPER_LAIR = "keeperLair";
globalAny.ERR_NOT_IN_RANGE = -9;
globalAny.ERR_GCL_NOT_ENOUGH = -15;
globalAny.CREEP_SPAWN_TIME = 3;
globalAny.ATTACK = "attack";
globalAny.RANGED_ATTACK = "ranged_attack";
globalAny.HEAL = "heal";
globalAny.TOUGH = "tough";
globalAny.CLAIM = "claim";
globalAny.STRUCTURE_RAMPART = "rampart";
globalAny.STRUCTURE_WALL = "constructedWall";
globalAny.STRUCTURE_LINK = "link";
globalAny.STRUCTURE_TERMINAL = "terminal";
globalAny.STRUCTURE_EXTRACTOR = "extractor";
globalAny.STRUCTURE_OBSERVER = "observer";
globalAny.STRUCTURE_LAB = "lab";
globalAny.STRUCTURE_POWER_SPAWN = "powerSpawn";
globalAny.FIND_MY_CREEPS = 102;
globalAny.FIND_HOSTILE_CREEPS = 103;
globalAny.ORDER_BUY = "buy";
globalAny.ORDER_SELL = "sell";
globalAny.FIND_NUKES = 117;

class TestStructure {}
class TestStructureContainer extends TestStructure {}
class TestStructureStorage extends TestStructure {}

globalAny.Structure = TestStructure;
globalAny.StructureContainer = TestStructureContainer;
globalAny.StructureStorage = TestStructureStorage;

class TestRoomPosition {
    x: number;
    y: number;
    roomName: string;

    constructor(x: number, y: number, roomName: string) {
        this.x = x;
        this.y = y;
        this.roomName = roomName;
    }

    getRangeTo(target: { x: number; y: number } | { pos: { x: number; y: number } }): number {
        const pos = "pos" in target ? target.pos : target;
        return Math.max(Math.abs(this.x - pos.x), Math.abs(this.y - pos.y));
    }

    findClosestByRange(targets: any[]): any | null {
        let best: any = null;
        let bestRange = Infinity;
        for (const t of targets) {
            const pos = t.pos ?? t;
            const r = Math.max(Math.abs(this.x - pos.x), Math.abs(this.y - pos.y));
            if (r < bestRange) {
                bestRange = r;
                best = t;
            }
        }
        return best;
    }

    findInRange(type: number, range: number): any[] {
        const game = globalAny.Game;
        const room = game.rooms[this.roomName];

        if (!room) return [];

        const all: any[] = room.find(type as any) ?? [];
        return all.filter((obj: any) => {
            const pos = obj.pos ?? obj;
            return Math.max(Math.abs(this.x - pos.x), Math.abs(this.y - pos.y)) <= range;
        });
    }

    lookFor(_type: string): any[] {
        const game = globalAny.Game;

        if (_type === globalAny.LOOK_CONSTRUCTION_SITES) {
            return Object.values(game?.constructionSites ?? {}).filter(
                (site: any) =>
                    site.pos.x === this.x && site.pos.y === this.y && site.pos.roomName === this.roomName
            );
        }

        return [];
    }

    createConstructionSite(structureType: string): number {
        const key = `${this.roomName}:${this.x}:${this.y}:${structureType}`;

        globalAny.Game.constructionSites[key] = {
            id: key as any,
            pos: new TestRoomPosition(this.x, this.y, this.roomName) as any,
            structureType: structureType as any
        } as any;

        return globalAny.OK;
    }
}

globalAny.RoomPosition = TestRoomPosition;
globalAny.PathFinder = {
    search(origin: { x: number; y: number; roomName: string }, goal: { pos: { x: number; y: number; roomName: string } }) {
        const path = [new TestRoomPosition(origin.x, origin.y, origin.roomName)];

        if (origin.roomName !== goal.pos.roomName) {
            path.push(new TestRoomPosition(25, 25, goal.pos.roomName));
        }

        path.push(new TestRoomPosition(goal.pos.x, goal.pos.y, goal.pos.roomName));

        return { path };
    }
};
