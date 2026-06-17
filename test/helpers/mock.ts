/**
 * Lightweight factories for the few game objects the unit tests need. Everything
 * is duck-typed and cast — we only implement the surface each test exercises.
 */

export interface MockStore {
    getUsedCapacity(resource?: string): number;
    getFreeCapacity(resource?: string): number;
    getCapacity(resource?: string): number;
}

export function makeStore(used: number, capacity = 50): MockStore {
    return {
        getUsedCapacity: () => used,
        getFreeCapacity: () => capacity - used,
        getCapacity: () => capacity
    };
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
    body?: BodyPartConstant[];
    memory?: Partial<CreepMemory>;
    store?: MockStore;
    pos?: RoomPosition;
    spawning?: boolean;
}

export function makeCreep(opts: MockCreepOpts = {}): Creep {
    const body = opts.body ?? [];
    const creep = {
        name: opts.name ?? "creep",
        memory: (opts.memory ?? {}) as CreepMemory,
        spawning: opts.spawning ?? false,
        store: opts.store ?? makeStore(0),
        pos: opts.pos ?? makePos(25, 25),
        body: body.map(part => ({ type: part, hits: 100 })),
        getActiveBodyparts: (part: BodyPartConstant) => body.filter(p => p === part).length
    };
    return creep as unknown as Creep;
}
