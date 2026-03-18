import { findSafeAnchor, requestedDefenders, roomThreat } from "combat/CombatUtils";
import { SpawnRequestPriority, clearSpawnRequest, planSpawnRequest } from "spawner/SpawnRequests";
import { createDefendTaskData } from "tasks/definitions/DefendTask";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { Plan } from "./Plan";

export class DefensePlan extends Plan {
    public override run(world: World): void {
        for (const [, worldRoom] of world.rooms) {
            const room = worldRoom.room;

            if (room.controller?.my) {
                this.runOwnedRoomDefense(worldRoom, world);
            } else {
                this.runRemoteRoomDefense(worldRoom, world);
            }
        }
    }

    private runOwnedRoomDefense(worldRoom: WorldRoom, world: World): void {
        const room = worldRoom.room;
        const hostiles = worldRoom.hostileCreeps;

        if (hostiles.length === 0) {
            clearSpawnRequest(room, "defender", `plan:defense:${room.name}`);
            room.memory.defense = {
                hostileCount: 0,
                threat: 0,
                lastHostileTick: room.memory.defense?.lastHostileTick ?? -1,
                requestedDefenders: 0,
                safeAnchor: room.memory.defense?.safeAnchor
            };
            return;
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

        planSpawnRequest(
            room,
            "defense",
            room.name,
            "defender",
            SpawnRequestPriority.HIGH + 10 + room.memory.defense.threat,
            room.memory.defense.requestedDefenders,
            5,
            200
        );

        world.taskManager.add(createDefendTaskData(room));
    }

    private runRemoteRoomDefense(worldRoom: WorldRoom, world: World): void {
        const room = worldRoom.room;
        const strategy = room.memory.remoteStrategy;

        if (!strategy || strategy.state !== "active" || !strategy.ownerRoom) {
            return;
        }

        const ownerRoom = Game.rooms[strategy.ownerRoom];
        if (!ownerRoom || !ownerRoom.controller?.my) {
            return;
        }

        const hostiles = worldRoom.hostileCreeps;
        if (hostiles.length === 0) {
            clearSpawnRequest(ownerRoom, "defender", `plan:defense:${room.name}`);
            return;
        }

        const threat = roomThreat(hostiles);
        const defenders = requestedDefenders(hostiles);

        planSpawnRequest(
            ownerRoom,
            "defense",
            room.name,
            "defender",
            SpawnRequestPriority.NORMAL + 20 + threat,
            defenders,
            5,
            200
        );

        world.taskManager.add(createDefendTaskData(room));
    }
}
