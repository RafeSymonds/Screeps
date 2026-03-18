import { Plan } from "./Plan";
import { World } from "world/World";
import { createReserveTaskData } from "tasks/definitions/ReserveTask";
import { planSpawnRequest, SpawnRequestPriority } from "spawner/SpawnRequests";
import { getMyUsername } from "utils/GameUtils";

const RESERVATION_THRESHOLD = 2500;

export class ReservationPlan extends Plan {
    public override run(world: World): void {
        for (const [remoteRoomName, roomMemory] of Object.entries(Memory.rooms)) {
            const strategy = roomMemory.remoteStrategy;
            if (!strategy || strategy.state !== "active" || !strategy.ownerRoom) continue;

            const ownerRoom = Game.rooms[strategy.ownerRoom];
            if (!ownerRoom?.controller?.my) continue;

            // Only reserve when owner is at least RCL 4
            if ((ownerRoom.controller?.level ?? 0) < 4) continue;

            // Check if the room needs reservation
            if (!this.needsReservation(remoteRoomName)) continue;

            // Don't create duplicate tasks
            const taskId = `Reserve-${remoteRoomName}`;
            if (world.taskManager.tasks.has(taskId)) continue;

            world.taskManager.add(createReserveTaskData(remoteRoomName, strategy.ownerRoom));

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

        // If we can't see the room, assume it needs reservation
        if (!room) return true;

        const controller = room.controller;
        if (!controller) return false;

        // Someone else owns it — can't reserve
        if (controller.owner) return false;

        // No reservation or reservation is decaying
        if (!controller.reservation) return true;

        // Our reservation is getting low
        if (controller.reservation.username === getMyUsername()) {
            return controller.reservation.ticksToEnd < RESERVATION_THRESHOLD;
        }

        // Someone else is reserving — we should contest it
        return true;
    }
}
