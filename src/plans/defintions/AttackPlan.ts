import { upsertSpawnRequest, clearSpawnRequest } from "spawner/SpawnRequests";
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
            if (!growth || growth.stage !== "surplus") continue;

            const storage = room.storage;
            if (!storage || storage.store.getUsedCapacity(RESOURCE_ENERGY) < 80000) continue;

            const target = this.findAttackTarget(room);
            if (!target) {
                clearSpawnRequest(room, "attacker", `attack:${room.name}`);
                room.memory.attackTarget = undefined;
                continue;
            }

            room.memory.attackTarget = target.roomName;

            upsertSpawnRequest(room, {
                role: "attacker",
                priority: 100,
                desiredCreeps: target.squadSize,
                expiresAt: Game.time + 30,
                requestedBy: `attack:${room.name}`,
                minEnergy: 800
            });

            world.taskManager.add(createAttackTaskData(target.roomName, room.name, target.squadSize));
        }
    }

    private findAttackTarget(room: Room): { roomName: string; squadSize: number } | null {
        let bestTarget: string | null = null;
        let bestScore = -Infinity;

        for (const roomName in Memory.rooms) {
            const intel = Memory.rooms[roomName]?.intel;
            if (!intel) continue;

            const isHostile = intel.hasInvaderCore ||
                (intel.hasEnemyBase && intel.owner && !intel.owner.includes("Invader"));

            if (!isHostile) continue;

            // Skip source keeper rooms
            if (intel.keeperLairs > 0) continue;

            const routeLength = estimateSafeRouteLength(room.name, roomName);
            if (routeLength === null || routeLength > 3) continue;

            const threatParts = intel.hostileMilitaryParts ?? 0;
            const freshness = Game.time - intel.lastScouted;

            // Skip if intel is too stale
            if (freshness > 5000) continue;

            // Score: prefer close, low-threat targets
            const score = 100 - routeLength * 30 - threatParts * 5 - freshness * 0.01;

            if (score > bestScore) {
                bestScore = score;
                bestTarget = roomName;
            }
        }

        if (!bestTarget) return null;

        const intel = Memory.rooms[bestTarget]?.intel;
        const threatParts = intel?.hostileMilitaryParts ?? 0;
        const squadSize = threatParts > 10 ? 4 : 2;

        return { roomName: bestTarget, squadSize };
    }
}
