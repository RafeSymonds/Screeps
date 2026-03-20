import { Plan } from "./Plan";
import { World } from "world/World";
import { createHarvestTaskData } from "tasks/definitions/HarvestTask";
import { createDeliverTaskData } from "tasks/definitions/DeliverTask";
import { createUpgradeTaskData } from "tasks/definitions/UpgradeTask";
import { containerIsSourceTied } from "rooms/RoomUtils";
import { createBuildTaskData } from "tasks/definitions/BuildTask";
import { getAdjacentPosition } from "world/WorldUtils";

function positionSignature(pos: RoomPosition): string {
    return `${pos.roomName}-${pos.x}-${pos.y}`;
}

const HOTSPOT_MAX_BUFFER = 600;

function hotspotBufferedEnergy(room: Room, pos: RoomPosition): number {
    const dropped = room
        .find(FIND_DROPPED_RESOURCES)
        .filter(resource => resource.resourceType === RESOURCE_ENERGY && resource.pos.getRangeTo(pos) <= 2)
        .reduce((sum, resource) => sum + resource.amount, 0);

    const tombstones = room
        .find(FIND_TOMBSTONES)
        .filter(t => t.pos.getRangeTo(pos) <= 2)
        .reduce((sum, t) => sum + t.store.getUsedCapacity(RESOURCE_ENERGY), 0);

    const ruins = room
        .find(FIND_RUINS)
        .filter(r => r.pos.getRangeTo(pos) <= 2)
        .reduce((sum, r) => sum + r.store.getUsedCapacity(RESOURCE_ENERGY), 0);

    return dropped + tombstones + ruins;
}

function hasNearbyEnergySink(room: Room, pos: RoomPosition): boolean {
    const storage = room.storage;
    if (storage && storage.pos.getRangeTo(pos) <= 3) {
        return true;
    }

    const nearbyContainers = room
        .find(FIND_STRUCTURES)
        .filter((s): s is StructureContainer => s.structureType === STRUCTURE_CONTAINER && s.pos.getRangeTo(pos) <= 2);

    return nearbyContainers.some(container => !containerIsSourceTied(container));
}

function getConstructionHotspot(room: Room, sites: ConstructionSite[]): RoomPosition | null {
    if (sites.length === 0) {
        return null;
    }

    const avgX = Math.round(sites.reduce((sum, site) => sum + site.pos.x, 0) / sites.length);
    const avgY = Math.round(sites.reduce((sum, site) => sum + site.pos.y, 0) / sites.length);
    const center = new RoomPosition(avgX, avgY, room.name);

    const centeredSite = center.findClosestByRange(sites);
    if (!centeredSite) {
        return null;
    }

    return getAdjacentPosition(centeredSite.pos, { requireWalkable: true });
}

export class EconomyPlan extends Plan {
    public override run(world: World): void {
        const taskManager = world.taskManager;

        for (const [, worldRoom] of world.rooms) {
            const room = worldRoom.room;

            if (room.controller?.my) {
                const sources = room.find(FIND_SOURCES);
                const energyGeneration = sources.length * 10;

                const storage = room.storage;
                const sourceContainers = room
                    .find(FIND_STRUCTURES)
                    .filter(
                        (s): s is StructureContainer =>
                            s.structureType === STRUCTURE_CONTAINER && containerIsSourceTied(s)
                    );
                const origins = storage ? [storage, ...sourceContainers, ...sources] : [...sourceContainers, ...sources];

                //
                // Harvest
                //
                for (const source of sources) {
                    taskManager.add(createHarvestTaskData(source));
                }

                //
                // Transfers (Sinks)
                //
                const sinks: (StructureSpawn | StructureExtension | StructureContainer | RoomPosition)[] = [];
                const positionSinks = new Set<string>();

                const addPositionSink = (pos: RoomPosition | null) => {
                    if (!pos) return;
                    if (hotspotBufferedEnergy(room, pos) >= HOTSPOT_MAX_BUFFER) return;
                    const key = positionSignature(pos);
                    if (positionSinks.has(key)) return;
                    sinks.push(pos);
                    positionSinks.add(key);
                };

                for (const s of room.find(FIND_MY_STRUCTURES)) {
                    if (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) {
                        sinks.push(s as StructureSpawn | StructureExtension);
                    }
                }

                for (const container of room
                    .find(FIND_STRUCTURES)
                    .filter((s): s is StructureContainer => s.structureType === STRUCTURE_CONTAINER)) {
                    if (!containerIsSourceTied(container)) {
                        sinks.push(container);
                    }
                }

                const spawn = room.find(FIND_MY_SPAWNS)[0];
                if (spawn) {
                    if (!hasNearbyEnergySink(room, spawn.pos)) {
                        addPositionSink(getAdjacentPosition(spawn.pos, { requireWalkable: true }));
                    }
                }

                if (room.controller && !hasNearbyEnergySink(room, room.controller.pos)) {
                    addPositionSink(getAdjacentPosition(room.controller.pos, { requireWalkable: true }));
                }

                const constructionSites = room.find(FIND_CONSTRUCTION_SITES);
                if (constructionSites.length > 0) {
                    const hotspot = getConstructionHotspot(room, constructionSites);
                    if (hotspot && !hasNearbyEnergySink(room, hotspot)) {
                        addPositionSink(hotspot);
                    }
                }

                // Sinks don't all empty at once, but we need more throughput than a simple serial split.
                // We request enough carry for about half the sinks to be refilled concurrently.
                const energyPerSink = sinks.length > 0 ? energyGeneration / Math.max(1, sinks.length * 0.5) : 10;

                for (const sink of sinks) {
                    let distance = 15; // default to 15 for safety
                    const sinkPos = sink instanceof RoomPosition ? sink : sink.pos;
                    if (origins.length > 0) {
                        const closest = sinkPos.findClosestByRange(origins);
                        if (closest) {
                            // Distance + 2 for pickup/drop time
                            distance = Math.max(5, sinkPos.getRangeTo(closest) + 2);
                        }
                    }
                    taskManager.add(createDeliverTaskData(sink, distance, energyPerSink));
                }

                //
                // Upgrade
                //
                if (room.controller) {
                    const storageEnergy = room.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
                    const rcl = room.controller.level;
                    const growth = room.memory.growth;
                    const spawnStats = room.memory.spawnStats;
                    
                    const pressurePenalty =
                        (spawnStats?.mine.pressure ?? 0) + (spawnStats?.carry.pressure ?? 0) + (spawnStats?.work.pressure ?? 0);

                    // Base demand depends on RCL
                    let desiredParts = rcl * 5;

                    // Throttling Logic:
                    if (storageEnergy < 1000) {
                        // Emergency level: just keep it alive
                        desiredParts = 1;
                    } else if (storageEnergy < 10000 || pressurePenalty > 0.8) {
                        // Struggling: minimal upgrading
                        desiredParts = Math.max(1, Math.floor(desiredParts * 0.2));
                    } else if (pressurePenalty > 0.4) {
                        // Moderate pressure: halved upgrading
                        desiredParts = Math.max(1, Math.floor(desiredParts * 0.5));
                    } else if (growth?.expansionReady) {
                        // Expansion ready: conserve energy for the new room
                        desiredParts = Math.max(1, Math.floor(desiredParts * 0.3));
                    } else if (storageEnergy > 200000) {
                        // Surplus: boost upgrading
                        desiredParts *= 2;
                    }

                    taskManager.add(createUpgradeTaskData(room.controller, desiredParts));
                }

                constructionSites.forEach(constructionSite => {
                    const taskData = createBuildTaskData(constructionSite);
                    taskManager.add(taskData);
                });
            }
        }
    }
}
