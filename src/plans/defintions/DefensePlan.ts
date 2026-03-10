import { findSafeAnchor, requestedDefenders, roomThreat } from "combat/CombatUtils";
import { createDefendTaskData } from "tasks/definitions/DefendTask";
import { World } from "world/World";
import { Plan } from "./Plan";

export class DefensePlan extends Plan {
    public override run(world: World): void {
        for (const [, worldRoom] of world.rooms) {
            const room = worldRoom.room;

            if (!room.controller?.my) {
                room.memory.defense = undefined;
                continue;
            }

            const hostiles = worldRoom.hostileCreeps;

            if (hostiles.length === 0) {
                room.memory.defense = {
                    hostileCount: 0,
                    threat: 0,
                    lastHostileTick: room.memory.defense?.lastHostileTick ?? -1,
                    requestedDefenders: 0,
                    safeAnchor: room.memory.defense?.safeAnchor
                };
                continue;
            }

            const safeAnchor = findSafeAnchor(room);
            room.memory.defense = {
                hostileCount: hostiles.length,
                threat: roomThreat(hostiles),
                lastHostileTick: Game.time,
                requestedDefenders: requestedDefenders(hostiles),
                safeAnchor: {
                    x: safeAnchor.x,
                    y: safeAnchor.y,
                    roomName: safeAnchor.roomName
                }
            };

            world.taskManager.add(createDefendTaskData(room));
        }
    }
}
