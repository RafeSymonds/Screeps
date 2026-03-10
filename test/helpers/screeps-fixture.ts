type ExitMap = Record<string, Partial<Record<1 | 3 | 5 | 7, string>>>;

type RoomSpec = {
    name: string;
    my?: boolean;
    level?: number;
    energyCapacityAvailable?: number;
    energyAvailable?: number;
    storageEnergy?: number;
    spawns?: any[];
    sources?: any[];
    constructionSites?: any[];
    structures?: any[];
    myStructures?: any[];
};

let exits: ExitMap = {};
let objects = new Map<string, any>();

function parseCoordinate(segment: string, positive: string): number {
    const direction = segment[0];
    const value = Number(segment.slice(1));
    return direction === positive ? value : -value - 1;
}

function roomCoords(roomName: string): [number, number] {
    const match = roomName.match(/^([WE]\d+)([NS]\d+)$/);

    if (!match) {
        return [0, 0];
    }

    return [parseCoordinate(match[1], "E"), parseCoordinate(match[2], "S")];
}

export function resetScreeps(): void {
    exits = {};
    objects = new Map();

    (global as any).Game = {
        time: 1,
        rooms: {},
        creeps: {},
        spawns: {},
        constructionSites: {},
        cpu: {
            getUsed: () => 0
        },
        map: {
            describeExits(roomName: string) {
                return exits[roomName] ?? {};
            },
            getRoomLinearDistance(a: string, b: string) {
                const [ax, ay] = roomCoords(a);
                const [bx, by] = roomCoords(b);
                return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
            },
            getRoomTerrain() {
                return { get: () => 0 };
            }
        },
        getObjectById(id: string) {
            return objects.get(id) ?? null;
        }
    };

    (global as any).Memory = {
        creeps: {},
        rooms: {},
        tasks: [],
        planRuns: {}
    };
}

export function setExits(nextExits: ExitMap): void {
    exits = nextExits;
}

export function setGameTime(time: number): void {
    (global as any).Game.time = time;
}

export function body(parts: BodyPartConstant[]): { type: BodyPartConstant }[] {
    return parts.map(type => ({ type }));
}

export function registerObject<T extends { id: string }>(object: T): T {
    objects.set(object.id, object);
    return object;
}

export function getConstructionSites(): any[] {
    return Object.values((global as any).Game.constructionSites);
}

export function addOwnedCreep(name: string, ownerRoom: string, parts: BodyPartConstant[]): Creep {
    const creep = {
        id: name + "-id",
        name,
        body: body(parts),
        memory: { ownerRoom, taskTicks: 0, working: false },
        store: {
            getUsedCapacity: () => 0,
            getFreeCapacity: () => 50,
            getCapacity: () => 50
        },
        pos: new RoomPosition(25, 25, ownerRoom),
        room: (global as any).Game.rooms[ownerRoom],
        spawning: false
    } as unknown as Creep;

    (global as any).Game.creeps[name] = creep;
    return creep;
}

export function createSource(id: string, roomName: string, x: number, y: number): Source {
    return registerObject({
        id,
        pos: new RoomPosition(x, y, roomName),
        room: (global as any).Game.rooms[roomName]
    } as Source);
}

export function createRoom(spec: RoomSpec): Room {
    const roomMemory = ((global as any).Memory.rooms[spec.name] ??= {
        numHarvestSpots: 0,
        assistRadius: 2,
        remoteRadius: 2
    });

    const room = {
        name: spec.name,
        memory: roomMemory,
        controller: spec.level
            ? {
                  my: spec.my ?? false,
                  level: spec.level,
                  pos: new RoomPosition(25, 25, spec.name)
              }
            : undefined,
        energyAvailable: spec.energyAvailable ?? spec.energyCapacityAvailable ?? 300,
        energyCapacityAvailable: spec.energyCapacityAvailable ?? 300,
        storage:
            spec.storageEnergy !== undefined
                ? {
                      store: {
                          getUsedCapacity: () => spec.storageEnergy
                      }
                  }
                : undefined,
        find(type: number) {
            switch (type) {
                case FIND_MY_SPAWNS:
                    return spec.spawns ?? [];
                case FIND_SOURCES:
                    return spec.sources ?? [];
                case FIND_CONSTRUCTION_SITES:
                    return spec.constructionSites ?? [];
                case FIND_STRUCTURES:
                    return spec.structures ?? [];
                case FIND_MY_STRUCTURES:
                    return spec.myStructures ?? spec.spawns ?? [];
                case FIND_DROPPED_RESOURCES:
                case FIND_TOMBSTONES:
                case FIND_RUINS:
                case FIND_MINERALS:
                    return [];
                default:
                    return [];
            }
        },
        lookForAtArea() {
            return [];
        },
        lookForAt() {
            return [];
        },
        createConstructionSite() {
            return OK;
        }
    } as unknown as Room;

    (global as any).Game.rooms[spec.name] = room;

    for (const spawn of spec.spawns ?? []) {
        registerObject(spawn);
    }

    for (const source of spec.sources ?? []) {
        registerObject(source);
    }

    return room;
}
