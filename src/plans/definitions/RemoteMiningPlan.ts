import { createRemoteHarvestTaskData } from "tasks/definitions/RemoteHarvestTask";
import { createRemoteHaulTaskData } from "tasks/definitions/RemoteHaulTask";
import { World } from "world/World";
import { Plan } from "./Plan";
import { refreshRemoteStrategies } from "rooms/RemoteStrategy";

export class RemoteMiningPlan extends Plan {
    public override run(world: World) {
        const taskManager = world.taskManager;

        refreshRemoteStrategies();

        for (const remoteRoomName in Memory.rooms) {
            const roomData = Memory.rooms[remoteRoomName];
            const remoteStrategy = roomData.remoteStrategy;

            if (remoteStrategy?.state !== "active" || !roomData.remoteMining || !remoteStrategy.ownerRoom) {
                continue;
            }

            for (const [sourceId, sourcePos] of roomData.remoteMining.sources) {
                taskManager.add(
                    createRemoteHarvestTaskData(
                        sourceId,
                        sourcePos,
                        remoteStrategy.ownerRoom,
                        remoteStrategy.routeLength ?? 1
                    )
                );
                taskManager.add(
                    createRemoteHaulTaskData(
                        sourceId,
                        sourcePos,
                        remoteStrategy.ownerRoom,
                        remoteStrategy.routeLength ?? 1
                    )
                );
            }
        }
    }
}
