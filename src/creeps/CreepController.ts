import { World } from "world/World";
import { CreepState } from "./CreepState";
import { EnergyTarget } from "rooms/ResourceManager";
import { CollectAction } from "actions/CollectionAction";
import { TaskManager } from "tasks/TaskManager";
import { getDefaultCreepMemory } from "./CreepMemory";

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

                    if (nextAction) {
                        nextAction.perform(creepState);
                    } else {
                        removeCreepTask(creepState, world.taskManager);
                    }
                }
            }
        }
    }
}

export function assignCreepEnegyPickup(creep: CreepState, energyTarget: EnergyTarget) {
    creep.memory.energyTargetId = energyTarget.id;
}

export function removeCreepTask(creepState: CreepState, taskManager: TaskManager) {
    const taskId = creepState.memory.taskId;

    if (taskId) {
        const task = taskManager.get(taskId);

        if (task) {
            task.removeCreep(creepState);
        }
    }

    creepState.memory = getDefaultCreepMemory();
}

export function tryOrMove<T extends RoomObject>(
    creep: Creep,
    target: T,
    action: (creep: Creep, target: T) => ScreepsReturnCode
): boolean {
    const result = action(creep, target);

    if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(target);
        return true; // we moved
    }

    return false; // no move
}

export function creepNeedsEnergy(creepState: CreepState) {
    const usedCapacity = creepState.creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const freeCapacity = creepState.creep.store.getFreeCapacity(RESOURCE_ENERGY);

    if (creepState.memory.working && usedCapacity === 0) {
        creepState.memory.working = false;
    }
    if (!creepState.memory.working && freeCapacity === 0) {
        creepState.memory.working = true;
    }

    return !creepState.memory.working;
}
