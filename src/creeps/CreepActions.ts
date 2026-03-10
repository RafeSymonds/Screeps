import { World } from "world/World";
import { CollectAction } from "actions/CollectionAction";
import { moveAtTickEnd } from "./EndTickCreepLogic";
import { moveAwayFromThreats, safeAnchorPosition } from "combat/CombatMovement";
import { hasCombatPart } from "./CreepUtils";
import { removeCreepTask } from "./CreepController";

export function performCreepActions(world: World) {
    for (const [, room] of world.rooms) {
        for (const creepState of room.myCreeps) {
            const currentRoomHostiles =
                creepState.creep.room.name === room.room.name
                    ? room.hostileCreeps
                    : creepState.creep.room.find(FIND_HOSTILE_CREEPS);

            if (
                currentRoomHostiles.length > 0 &&
                !hasCombatPart(creepState.creep)
            ) {
                moveAwayFromThreats(
                    creepState,
                    currentRoomHostiles,
                    safeAnchorPosition(room.room.name)
                );
                continue;
            }

            if (creepState.memory.energyTargetId) {
                let energyTarget = Game.getObjectById(creepState.memory.energyTargetId);

                if (energyTarget) {
                    let action = new CollectAction(energyTarget);
                    action.perform(creepState);
                } else {
                    creepState.memory.energyTargetId = undefined;
                }
            } else {
                const task = creepState.memory.taskId
                    ? world.taskManager.tasks.get(creepState.memory.taskId)
                    : undefined;

                if (task) {
                    const nextAction = task.nextAction(creepState, world.resourceManager);

                    if (nextAction) {
                        nextAction.perform(creepState);
                    } else {
                        removeCreepTask(creepState, world.taskManager);
                    }
                }
            }
        }
    }

    for (const [, room] of world.rooms) {
        for (const creepState of room.myCreeps) {
            moveAtTickEnd(creepState);
        }
    }
}
