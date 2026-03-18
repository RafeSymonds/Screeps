import { Plan } from "./Plan";
import { World } from "world/World";
import { createRepairTaskData } from "tasks/definitions/RepairTask";

const REPAIR_THRESHOLD = 0.8; // Repair structures below 80% hits

export class MaintenancePlan extends Plan {
    public override run(world: World): void {
        const taskManager = world.taskManager;

        for (const [, worldRoom] of world.rooms) {
            const room = worldRoom.room;

            if (room.controller?.my) {
                const structures = room.find(FIND_STRUCTURES).filter(s => {
                    // Don't create repair tasks for walls/ramparts (towers handle them, or special fortification logic)
                    if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) {
                        return false;
                    }
                    return s.hits < s.hitsMax * REPAIR_THRESHOLD;
                });

                for (const structure of structures) {
                    taskManager.add(createRepairTaskData(structure));
                }
            }
        }
    }
}
