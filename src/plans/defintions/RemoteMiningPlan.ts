import { createRemoteHarvestTaskData, ownerRoomForRemoteHarvest } from "tasks/definitions/RemoteHarvestTask";
import { createRemoteHaulTaskData } from "tasks/definitions/RemoteHaulTask";
import { World } from "world/World";
import { Plan } from "./Plan";
import { IntelStatus, intelStatus } from "rooms/RoomIntel";

export class RemoteMiningPlan extends Plan {
    public override run(world: World) {
        const taskManager = world.taskManager;

        for (const remoteRoomName in Memory.rooms) {
            const roomData = Memory.rooms[remoteRoomName];

            if (intelStatus(roomData.intel) == IntelStatus.OPEN && roomData.remoteMining) {
                // TODO: Decide if remote is worth mining

                const ownerRoom = ownerRoomForRemoteHarvest(remoteRoomName);

                if (!ownerRoom) {
                    continue;
                }

                for (const [sourceId, sourcePos] of roomData.remoteMining?.sources) {
                    taskManager.add(createRemoteHarvestTaskData(sourceId, sourcePos, ownerRoom));
                    taskManager.add(createRemoteHaulTaskData(sourceId, sourcePos));
                }
            }
        }
    }
}
