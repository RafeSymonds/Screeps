/**
 * The per-tick read model: game state becomes plain data once, here, and all
 * decision logic consumes the views. Every find constant is called at most once
 * per room per tick. See docs/design/snapshot.md.
 */
import {
    ControllerView,
    CreepView,
    HostileView,
    Pos,
    RoomSnapshot,
    StoreView,
    StructuresByType,
    StructureView,
    WorldSnapshot
} from "shared/views";

function toPos(pos: RoomPosition): Pos {
    return { x: pos.x, y: pos.y, roomName: pos.roomName };
}

function toStoreView(store: StoreDefinition | Store<ResourceConstant, boolean>): StoreView {
    const byResource: Partial<Record<ResourceConstant, number>> = {};
    for (const [key, value] of Object.entries(store)) {
        if (typeof value === "number" && value > 0) {
            byResource[key as ResourceConstant] = value;
        }
    }
    return {
        // Restricted stores (spawn/extension/tower: energy-only) return null for the
        // argless calls — the energy-keyed fallback is load-bearing, not defensive.
        free: store.getFreeCapacity() ?? store.getFreeCapacity(RESOURCE_ENERGY) ?? 0,
        used: store.getUsedCapacity() ?? store.getUsedCapacity(RESOURCE_ENERGY) ?? 0,
        byResource
    };
}

function toBodyCounts(body: BodyPartDefinition[]): Partial<Record<BodyPartConstant, number>> {
    const counts: Partial<Record<BodyPartConstant, number>> = {};
    for (const part of body) {
        counts[part.type] = (counts[part.type] ?? 0) + 1;
    }
    return counts;
}

function toCreepView(creep: Creep): CreepView {
    const view: CreepView = {
        name: creep.name,
        id: creep.id,
        pos: toPos(creep.pos),
        hits: creep.hits,
        hitsMax: creep.hitsMax,
        spawning: creep.spawning,
        bodyCounts: toBodyCounts(creep.body),
        store: toStoreView(creep.store),
        memory: creep.memory
    };
    if (creep.ticksToLive !== undefined) {
        view.ticksToLive = creep.ticksToLive;
    }
    return view;
}

function toHostileView(creep: Creep): HostileView {
    return {
        id: creep.id,
        pos: toPos(creep.pos),
        owner: creep.owner.username,
        hits: creep.hits,
        bodyCounts: toBodyCounts(creep.body)
    };
}

function toControllerView(controller: StructureController): ControllerView {
    const view: ControllerView = {
        id: controller.id,
        pos: toPos(controller.pos),
        level: controller.level,
        my: controller.my === true,
        progress: controller.progress ?? 0,
        progressTotal: controller.progressTotal ?? 0,
        ticksToDowngrade: controller.ticksToDowngrade ?? 0,
        safeModeAvailable: controller.safeModeAvailable ?? 0
    };
    if (controller.safeMode !== undefined) {
        view.safeMode = controller.safeMode;
    }
    if (controller.safeModeCooldown !== undefined) {
        view.safeModeCooldown = controller.safeModeCooldown;
    }
    if (controller.upgradeBlocked !== undefined) {
        view.upgradeBlocked = controller.upgradeBlocked;
    }
    return view;
}

function toStructureView(s: AnyStructure): StructureView {
    const view: StructureView = {
        id: s.id as Id<AnyStructure>,
        type: s.structureType,
        pos: toPos(s.pos),
        hits: s.hits ?? 0,
        hitsMax: s.hitsMax ?? 0
    };
    const store = (s as { store?: StoreDefinition }).store;
    if (store) {
        view.store = toStoreView(store);
    }
    if (s.structureType === STRUCTURE_SPAWN) {
        view.spawning = Boolean((s as StructureSpawn).spawning);
    }
    return view;
}

function buildRoomView(room: Room): RoomSnapshot {
    const structures: StructuresByType = {};
    for (const s of room.find(FIND_STRUCTURES)) {
        (structures[s.structureType] ??= []).push(toStructureView(s));
    }
    const view: RoomSnapshot = {
        name: room.name,
        my: room.controller?.my === true,
        energyAvailable: room.energyAvailable ?? 0,
        energyCapacityAvailable: room.energyCapacityAvailable ?? 0,
        sources: room.find(FIND_SOURCES).map(s => ({
            id: s.id,
            pos: toPos(s.pos),
            energy: s.energy,
            energyCapacity: s.energyCapacity
        })),
        structures,
        myConstructionSites: room.find(FIND_MY_CONSTRUCTION_SITES).map(site => ({
            id: site.id,
            pos: toPos(site.pos),
            type: site.structureType,
            progress: site.progress,
            progressTotal: site.progressTotal
        })),
        hostiles: room.find(FIND_HOSTILE_CREEPS).map(toHostileView),
        dropped: room.find(FIND_DROPPED_RESOURCES).map(r => ({
            id: r.id,
            pos: toPos(r.pos),
            resource: r.resourceType,
            amount: r.amount
        }))
    };
    if (room.controller) {
        view.controller = toControllerView(room.controller);
    }
    const mineral = room.find(FIND_MINERALS)[0];
    if (mineral) {
        view.mineral = {
            id: mineral.id,
            pos: toPos(mineral.pos),
            type: mineral.mineralType,
            amount: mineral.mineralAmount
        };
    }
    return view;
}

class Snapshot implements WorldSnapshot {
    public readonly time: number;
    private readonly roomViews = new Map<string, RoomSnapshot>();
    private readonly ownedRooms: RoomSnapshot[];
    private readonly creepViews: CreepView[];

    public constructor() {
        this.time = Game.time;
        this.creepViews = Object.values(Game.creeps).map(toCreepView);
        this.ownedRooms = [];
        for (const room of Object.values(Game.rooms)) {
            if (room.controller?.my === true) {
                const view = buildRoomView(room);
                this.roomViews.set(room.name, view);
                this.ownedRooms.push(view);
            }
        }
    }

    private assertFresh(): void {
        if (Game.time !== this.time) {
            throw new Error(`stale snapshot: built at tick ${this.time}, accessed at ${Game.time}`);
        }
    }

    public get myRooms(): RoomSnapshot[] {
        this.assertFresh();
        return this.ownedRooms;
    }

    public get myCreeps(): CreepView[] {
        this.assertFresh();
        return this.creepViews;
    }

    public room(name: string): RoomSnapshot | undefined {
        this.assertFresh();
        const cached = this.roomViews.get(name);
        if (cached) {
            return cached;
        }
        const room = Game.rooms[name];
        if (!room) {
            return undefined;
        }
        const view = buildRoomView(room);
        this.roomViews.set(name, view);
        return view;
    }
}

/** Called by the shell once per tick, metered under SubsystemId.Snapshot. */
export function buildSnapshot(): WorldSnapshot {
    return new Snapshot();
}
