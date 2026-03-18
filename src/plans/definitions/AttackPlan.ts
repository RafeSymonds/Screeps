import { planSpawnRequest, clearSpawnRequest, SpawnRequestPriority } from "spawner/SpawnRequests";
import { createAttackTaskData } from "tasks/definitions/AttackTask";
import { World } from "world/World";
import { Plan } from "./Plan";
import { estimateSafeRouteLength } from "rooms/InterRoomRouter";

export class AttackPlan extends Plan {
    public override run(world: World): void {
        for (const [, worldRoom] of world.rooms) {
            const room = worldRoom.room;
            if (!room.controller?.my) continue;

            const growth = room.memory.growth;
            const storage = room.storage;
            const energy = storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
            const isSurplus = (growth?.stage === "surplus") && energy > 80000;
            const isHealthy = energy > 20000;

            const target = this.findAttackTarget(room, isSurplus, isHealthy);
            if (!target) {
                clearSpawnRequest(room, "attacker", `plan:attack:${room.name}`);
                room.memory.attackTarget = undefined;
                continue;
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
    }

    private findAttackTarget(room: Room, isSurplus: boolean, isHealthy: boolean): { roomName: string; squadSize: number; priority: number } | null {
        let bestTarget: string | null = null;
        let bestScore = -Infinity;
        let bestPriority = SpawnRequestPriority.NORMAL + 10;

        for (const roomName in Memory.rooms) {
            const intel = Memory.rooms[roomName]?.intel;
            if (!intel) continue;

            const hasCore = intel.hasInvaderCore;
            const hasBase = intel.hasEnemyBase && intel.owner && !intel.owner.includes("Invader");

            if (!hasCore && !hasBase) continue;

            // Skip source keeper rooms
            if (intel.keeperLairs > 0) continue;

            const routeLength = estimateSafeRouteLength(room.name, roomName);
            if (routeLength === null || routeLength > 3) continue;

            // Proactive clearing of cores in remote radius
            const inRemoteRadius = routeLength <= (room.memory.remoteRadius ?? 2);
            
            // If not surplus, only attack cores in remote radius if healthy
            if (!isSurplus) {
                if (!hasCore || !inRemoteRadius || !isHealthy) continue;
            }

            const threatParts = intel.hostileMilitaryParts ?? 0;
            const freshness = Game.time - intel.lastScouted;

            // Skip if intel is too stale
            if (freshness > 5000) continue;

            // Score: prefer close, low-threat targets
            let score = 100 - routeLength * 30 - threatParts * 5 - freshness * 0.01;
            let priority = SpawnRequestPriority.NORMAL + 10;

            if (hasCore && inRemoteRadius) {
                score += 200; // High priority for cores blocking remotes
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
