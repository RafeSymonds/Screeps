import { SpawnRequestPriority, clearSpawnRequest, planSpawnRequest } from "spawner/SpawnRequests";
import { createAttackTaskData } from "tasks/definitions/AttackTask";
import { createReserveTaskData } from "tasks/definitions/ReserveTask";
import { World } from "world/World";
import { Plan } from "./Plan";
import { estimateSafeRouteLength } from "rooms/InterRoomRouter";
import { getMyUsername } from "utils/GameUtils";

const RESERVATION_THRESHOLD = 2500;

export class AttackPlan extends Plan {
    public override run(world: World): void {
        for (const [, worldRoom] of world.rooms) {
            const room = worldRoom.room;
            if (!room.controller?.my) continue;

            this.runReservations(room, world);
            this.runAttacks(room, world);
        }
    }

    private runReservations(ownerRoom: Room, world: World): void {
        if ((ownerRoom.controller?.level ?? 0) < 4) return;

        for (const [remoteRoomName, roomMemory] of Object.entries(Memory.rooms)) {
            const strategy = roomMemory.remoteStrategy;
            if (!strategy || strategy.state !== "active" || !strategy.ownerRoom) continue;
            if (strategy.ownerRoom !== ownerRoom.name) continue;

            if (!this.needsReservation(remoteRoomName)) continue;

            const taskId = `Reserve-${remoteRoomName}`;
            if (world.taskManager.tasks.has(taskId)) continue;

            world.taskManager.add(createReserveTaskData(remoteRoomName, ownerRoom.name));

            planSpawnRequest(
                ownerRoom,
                "reserve",
                remoteRoomName,
                "reserver",
                SpawnRequestPriority.NORMAL + 20,
                1,
                30,
                650
            );
        }
    }

    private needsReservation(roomName: string): boolean {
        const room = Game.rooms[roomName];

        if (!room) return true;

        const controller = room.controller;
        if (!controller) return false;

        if (controller.owner) return false;

        if (!controller.reservation) return true;

        if (controller.reservation.username === getMyUsername()) {
            return controller.reservation.ticksToEnd < RESERVATION_THRESHOLD;
        }

        return true;
    }

    private runAttacks(room: Room, world: World): void {
        const growth = room.memory.growth;
        const storage = room.storage;
        const energy = storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
        const isSurplus = growth?.stage === "surplus" && energy > 80000;
        const isHealthy = energy > 20000;

        const target = this.findAttackTarget(room, isSurplus, isHealthy);
        if (!target) {
            clearSpawnRequest(room, "attacker", `plan:attack:${room.name}`);
            room.memory.attackTarget = undefined;
            return;
        }

        room.memory.attackTarget = target.roomName;

        planSpawnRequest(
            room,
            "attack",
            room.name,
            "attacker",
            target.priority,
            target.squadSize,
            30,
            isSurplus ? 800 : 400
        );

        world.taskManager.add(createAttackTaskData(target.roomName, room.name, target.squadSize));
    }

    private findAttackTarget(
        room: Room,
        isSurplus: boolean,
        isHealthy: boolean
    ): { roomName: string; squadSize: number; priority: number } | null {
        let bestTarget: string | null = null;
        let bestScore = -Infinity;
        let bestPriority = SpawnRequestPriority.NORMAL + 10;

        for (const roomName in Memory.rooms) {
            const intel = Memory.rooms[roomName]?.intel;
            if (!intel) continue;

            const hasCore = intel.hasInvaderCore;
            const hasBase = intel.hasEnemyBase && intel.owner && !intel.owner.includes("Invader");

            if (!hasCore && !hasBase) continue;

            if (intel.keeperLairs > 0) continue;

            const routeLength = estimateSafeRouteLength(room.name, roomName);
            if (routeLength === null || routeLength > 3) continue;

            const inRemoteRadius = routeLength <= (room.memory.remoteRadius ?? 2);

            if (!isSurplus) {
                if (!hasCore || !inRemoteRadius || !isHealthy) continue;
            }

            const threatParts = intel.hostileMilitaryParts ?? 0;
            const freshness = Game.time - intel.lastScouted;

            if (freshness > 5000) continue;

            let score = 100 - routeLength * 30 - threatParts * 5 - freshness * 0.01;
            let priority = SpawnRequestPriority.NORMAL + 10;

            if (hasCore && inRemoteRadius) {
                score += 200;
                priority = SpawnRequestPriority.HIGH - 10;
            }

            if (score > bestScore) {
                bestScore = score;
                bestTarget = roomName;
                bestPriority = priority;
            }
        }

        if (!bestTarget) return null;

        const intel = Memory.rooms[bestTarget]?.intel;
        const threatParts = intel?.hostileMilitaryParts ?? 0;
        const squadSize = threatParts > 10 ? 4 : 2;

        return { roomName: bestTarget, squadSize, priority: bestPriority };
    }
}
