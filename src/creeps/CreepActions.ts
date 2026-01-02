import { World } from "world/World";
import { CollectAction } from "actions/CollectionAction";
import { moveAtTickEnd } from "./EndTickCreepLogic";
import { removeCreepTask } from "./CreepController";

export function performCreepActions(world: World) {
    for (const [, room] of world.rooms) {
        for (const creepState of room.myCreeps) {
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

                    console.log("Next action is ", nextAction);

                    if (nextAction) {
                        nextAction.perform(creepState);
                    } else {
                        console.log("next action was null so removing creep from task");

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
