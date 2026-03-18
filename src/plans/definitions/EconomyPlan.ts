import { Plan } from "./Plan";
import { World } from "world/World";
import { createHarvestTaskData } from "tasks/definitions/HarvestTask";
import { createDeliverTaskData } from "tasks/definitions/DeliverTask";
import { createUpgradeTaskData } from "tasks/definitions/UpgradeTask";
import { containerIsSourceTied } from "rooms/RoomUtils";
import { createBuildTaskData } from "tasks/definitions/BuildTask";
import { getAdjacentPosition } from "world/WorldUtils";
import { drop } from "lodash";

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
                    .filter((s): s is StructureContainer => s.structureType === STRUCTURE_CONTAINER && containerIsSourceTied(s));
                const origins = storage ? [storage, ...sourceContainers] : sourceContainers;

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

                for (const s of room.find(FIND_MY_STRUCTURES)) {
                    if (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) {
                        sinks.push(s);
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
                    const dropSpot = getAdjacentPosition(spawn.pos);
                    if (dropSpot) {
                        sinks.push(dropSpot);
                    }
                }

                const energyPerSink = sinks.length > 0 ? energyGeneration / sinks.length : 10;

                for (const sink of sinks) {
                    let distance = 8;
                    const sinkPos = sink instanceof RoomPosition ? sink : sink.pos;
                    if (origins.length > 0) {
                        const closest = sinkPos.findClosestByRange(origins);
                        if (closest) {
                            distance = sinkPos.getRangeTo(closest);
                        }
                    }
                    taskManager.add(createDeliverTaskData(sink, distance, energyPerSink));
                }

                //
                // Upgrade
                //
                if (room.controller) {
                    taskManager.add(createUpgradeTaskData(room.controller));
                }

                const constructionSites = room.find(FIND_CONSTRUCTION_SITES);

                constructionSites.forEach(constructionSite => {
                    const taskData = createBuildTaskData(constructionSite);
                    taskManager.add(taskData);
                });
            }
        }
    }
}
