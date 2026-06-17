/**
 * Per-tick view of a single room. Does all the room.find() work once and caches
 * the buckets so no other subsystem has to scan ad hoc. Everything downstream
 * reads from here rather than touching the live Room directly.
 */
export class WorldRoom {
    public readonly room: Room;
    public readonly name: string;
    public readonly isMine: boolean;
    public readonly controller?: StructureController;
    public readonly sources: Source[];
    public readonly spawns: StructureSpawn[];
    public readonly extensions: StructureExtension[];
    public readonly towers: StructureTower[];
    public readonly containers: StructureContainer[];
    public readonly constructionSites: ConstructionSite[];
    public readonly hostiles: Creep[];
    public readonly droppedEnergy: Resource[];

    public constructor(room: Room) {
        this.room = room;
        this.name = room.name;
        this.controller = room.controller;
        this.isMine = room.controller?.my === true;
        this.sources = room.find(FIND_SOURCES);
        this.hostiles = room.find(FIND_HOSTILE_CREEPS);
        this.constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
        this.droppedEnergy = room
            .find(FIND_DROPPED_RESOURCES)
            .filter(resource => resource.resourceType === RESOURCE_ENERGY);

        this.spawns = [];
        this.extensions = [];
        this.towers = [];
        this.containers = [];
        for (const structure of room.find(FIND_STRUCTURES)) {
            switch (structure.structureType) {
                case STRUCTURE_SPAWN:
                    this.spawns.push(structure);
                    break;
                case STRUCTURE_EXTENSION:
                    this.extensions.push(structure);
                    break;
                case STRUCTURE_TOWER:
                    this.towers.push(structure);
                    break;
                case STRUCTURE_CONTAINER:
                    this.containers.push(structure);
                    break;
            }
        }
    }

    public get energyAvailable(): number {
        return this.room.energyAvailable;
    }

    public get energyCapacityAvailable(): number {
        return this.room.energyCapacityAvailable;
    }

    public get rcl(): number {
        return this.controller?.level ?? 0;
    }

    /** Spawn/extension/tower structures that still have room for energy. */
    public energySinks(): (StructureSpawn | StructureExtension | StructureTower)[] {
        const sinks: (StructureSpawn | StructureExtension | StructureTower)[] = [];
        for (const spawn of this.spawns) {
            if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                sinks.push(spawn);
            }
        }
        for (const extension of this.extensions) {
            if (extension.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                sinks.push(extension);
            }
        }
        for (const tower of this.towers) {
            if (tower.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                sinks.push(tower);
            }
        }
        return sinks;
    }

    /** Containers/storage holding withdrawable energy, biggest first. */
    public energyStores(): (StructureContainer | StructureStorage)[] {
        const stores: (StructureContainer | StructureStorage)[] = [];
        for (const container of this.containers) {
            if (container.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                stores.push(container);
            }
        }
        const storage = this.room.storage;
        if (storage && storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            stores.push(storage);
        }
        return stores;
    }
}
