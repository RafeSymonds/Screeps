import { Plan } from "./Plan";
import { World } from "world/World";
import { createHarvestTaskData } from "tasks/definitions/HarvestTask";
import { createtransferTaskData } from "tasks/definitions/TransferTask";
import { createUpgradeTaskData } from "tasks/definitions/UpgradeTask";
import { containerIsSourceTied } from "rooms/ResourceManager";

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
                        taskManager.add(createtransferTaskData(s));
                    }
                }

                for (const container of room
                    .find(FIND_STRUCTURES)
                    .filter((s): s is StructureContainer => s.structureType === STRUCTURE_EXTENSION)) {
                    if (!containerIsSourceTied(container)) {
                        taskManager.add(createtransferTaskData(container));
                    }
                }

                //
                // Upgrade
                //
                if (room.controller) {
                    taskManager.add(createUpgradeTaskData(room.controller));
                }
            }
        }
    }
}
