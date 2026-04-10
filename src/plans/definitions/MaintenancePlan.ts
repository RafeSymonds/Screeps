import { Plan } from "./Plan";
import { World } from "world/World";
import { createRepairTaskData } from "tasks/definitions/RepairTask";

const REPAIR_THRESHOLD = 0.8;
const WALL_REPAIR_THRESHOLD = 0.5;
const MIN_WALL_HITS = 1000;

export class MaintenancePlan extends Plan {
    public override run(world: World): void {
        const taskManager = world.taskManager;

        for (const [, worldRoom] of world.rooms) {
            const room = worldRoom.room;

            if (room.controller?.my) {
                const rcl = room.controller.level;

                const structures = room.find(FIND_STRUCTURES).filter(s => {
                    if (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) {
                        const hitsRatio = s.hits / s.hitsMax;
                        const minHits = getMinWallHits(rcl);
                        return s.hits < minHits || hitsRatio < WALL_REPAIR_THRESHOLD;
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

function getMinWallHits(rcl: number): number {
    if (rcl >= 8) return 1000000;
    if (rcl >= 7) return 300000;
    if (rcl >= 6) return 100000;
    if (rcl >= 5) return 30000;
    if (rcl >= 4) return 10000;
    if (rcl >= 3) return 5000;
    if (rcl >= 2) return 1000;
    return MIN_WALL_HITS;
}
