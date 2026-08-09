/**
 * Lightweight factories for the few game objects the unit tests need. Everything
 * is duck-typed and cast — we only implement the surface each test exercises.
 */

export interface MockStore {
    getUsedCapacity(resource?: string): number;
    getFreeCapacity(resource?: string): number;
    getCapacity(resource?: string): number;
    [resource: string]: unknown;
}

export function makeStore(used: number, capacity = 50, resource = "energy"): MockStore {
    const store: MockStore = {
        getUsedCapacity: () => used,
        getFreeCapacity: () => capacity - used,
        getCapacity: () => capacity
    };
    if (used > 0) {
        store[resource] = used;
    }
    return store;
}

/** Energy-only store (spawn/extension/tower): argless capacity calls return null,
 *  exactly like the real API — the gotcha that broke M2's haul loop. */
export function makeRestrictedStore(used: number, capacity = 300): MockStore {
    const store: MockStore = {
        getUsedCapacity: (resource?: string) => (resource === "energy" ? used : (null as unknown as number)),
        getFreeCapacity: (resource?: string) => (resource === "energy" ? capacity - used : (null as unknown as number)),
        getCapacity: (resource?: string) => (resource === "energy" ? capacity : (null as unknown as number))
    };
    if (used > 0) {
        store.energy = used;
    }
    return store;
}

export function makePos(x: number, y: number, roomName = "W1N1"): RoomPosition {
    const pos = {
        x,
        y,
        roomName,
        getRangeTo: (target: { pos?: { x: number; y: number } } | { x: number; y: number }) => {
            const tp = "pos" in target && target.pos ? target.pos : (target as { x: number; y: number });
            return Math.max(Math.abs(x - tp.x), Math.abs(y - tp.y));
        },
        findClosestByRange: (arr: unknown[]) => (arr.length > 0 ? arr[0] : null),
        findInRange: () => []
    };
    return pos as unknown as RoomPosition;
}

export interface MockCreepOpts {
    name?: string;
    id?: string;
    body?: BodyPartConstant[];
    memory?: Partial<CreepMemory>;
    store?: MockStore;
    pos?: RoomPosition;
    spawning?: boolean;
    hits?: number;
    hitsMax?: number;
    ticksToLive?: number;
    owner?: string;
}

export function makeCreep(opts: MockCreepOpts = {}): Creep {
    const body = opts.body ?? [];
    const creep = {
        name: opts.name ?? "creep",
        id: opts.id ?? `id-${opts.name ?? "creep"}`,
        memory: (opts.memory ?? {}) as CreepMemory,
        spawning: opts.spawning ?? false,
        store: opts.store ?? makeStore(0),
        pos: opts.pos ?? makePos(25, 25),
        hits: opts.hits ?? 100,
        hitsMax: opts.hitsMax ?? 100,
        ticksToLive: opts.spawning ? undefined : opts.ticksToLive ?? 1500,
        owner: { username: opts.owner ?? "me" },
        body: body.map(part => ({ type: part, hits: 100 })),
        getActiveBodyparts: (part: BodyPartConstant) => body.filter(p => p === part).length
    };
    return creep as unknown as Creep;
}

export interface MockStructureOpts {
    id?: string;
    pos?: RoomPosition;
    hits?: number;
    hitsMax?: number;
    store?: MockStore;
}

export function makeStructure(type: string, opts: MockStructureOpts = {}): AnyStructure {
    const structure: Record<string, unknown> = {
        id: opts.id ?? `id-${type}`,
        structureType: type,
        pos: opts.pos ?? makePos(10, 10),
        hits: opts.hits ?? 1000,
        hitsMax: opts.hitsMax ?? 1000
    };
    if (opts.store) {
        structure.store = opts.store;
    }
    return structure as unknown as AnyStructure;
}

export interface MockRoomOpts {
    name?: string;
    my?: boolean;
    controller?: Record<string, unknown> | null;
    sources?: unknown[];
    minerals?: unknown[];
    structures?: unknown[];
    hostiles?: unknown[];
    dropped?: unknown[];
    sites?: unknown[];
    energyAvailable?: number;
    energyCapacityAvailable?: number;
}

/** A room whose find() dispatches on the find constants the snapshot uses. */
export function makeRoom(opts: MockRoomOpts = {}): Room {
    const name = opts.name ?? "W1N1";
    const my = opts.my ?? true;
    const controller =
        opts.controller === null
            ? undefined
            : {
                  id: `ctrl-${name}`,
                  pos: makePos(25, 18, name),
                  level: 1,
                  my,
                  progress: 0,
                  progressTotal: 200,
                  ticksToDowngrade: 20000,
                  safeModeAvailable: 1,
                  ...(opts.controller ?? {})
              };
    const room = {
        name,
        controller,
        energyAvailable: opts.energyAvailable ?? 300,
        energyCapacityAvailable: opts.energyCapacityAvailable ?? 300,
        find: (constant: number): unknown[] => {
            switch (constant) {
                case FIND_SOURCES:
                    return opts.sources ?? [];
                case FIND_MINERALS:
                    return opts.minerals ?? [];
                case FIND_STRUCTURES:
                    return opts.structures ?? [];
                case FIND_MY_CONSTRUCTION_SITES:
                    return opts.sites ?? [];
                case FIND_HOSTILE_CREEPS:
                    return opts.hostiles ?? [];
                case FIND_DROPPED_RESOURCES:
                    return opts.dropped ?? [];
                default:
                    return [];
            }
        }
    };
    return room as unknown as Room;
}
