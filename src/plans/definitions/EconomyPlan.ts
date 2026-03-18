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
                //
                // Harvest
                //
                for (const source of room.find(FIND_SOURCES)) {
                    taskManager.add(createHarvestTaskData(source));
                }

                //
                // Transfers
                //
                for (const s of room.find(FIND_MY_STRUCTURES)) {
                    if (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) {
                        taskManager.add(createDeliverTaskData(s));
                    }
                }

                for (const container of room
                    .find(FIND_STRUCTURES)
                    .filter((s): s is StructureContainer => s.structureType === STRUCTURE_CONTAINER)) {
                    if (!containerIsSourceTied(container)) {
                        taskManager.add(createDeliverTaskData(container));
                    }
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

                const spawn = room.find(FIND_MY_SPAWNS)[0];
                if (spawn) {
                    const dropSpot = getAdjacentPosition(spawn.pos);
                    if (dropSpot) {
                        taskManager.add(createDeliverTaskData(dropSpot));
                    }
                }
            }
        }
    }
}
