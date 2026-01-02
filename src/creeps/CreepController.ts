import { CreepState } from "./CreepState";
import { EnergyTarget } from "rooms/RoomEnergyState";
import { TaskManager } from "tasks/core/TaskManager";
import { getDefaultCreepMemory } from "./CreepMemory";
import { AnyTask } from "tasks/definitions/Task";

export function updateCreepMemoryForTask(creepState: CreepState, task: AnyTask) {
    creepState.memory.taskId = task.id();
    creepState.memory.taskTicks = 0;
    creepState.memory.energyTargetId = undefined;
    creepState.memory.working = true;
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

    creepState.memory = getDefaultCreepMemory(creepState.memory.ownerRoom);
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

export function creepStoreFull(creep: Creep): boolean {
    const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);

    return freeCapacity === 0;
}

export function creepStoreFullPercentage(creep: Creep) {
    const usedCapacity = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const totalCapacity = creep.store.getCapacity(RESOURCE_ENERGY);

    return usedCapacity / totalCapacity;
}

export function creepNeedsEnergy(creepState: CreepState) {
    const usedCapacity = creepState.creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const freeCapacity = creepState.creep.store.getFreeCapacity(RESOURCE_ENERGY);

    if (creepState.memory.working && usedCapacity === 0) {
        creepState.memory.working = false;
    } else if (!creepState.memory.working && freeCapacity === 0) {
        creepState.memory.working = true;
    }

    return !creepState.memory.working;
}

export function tryPreemptCreep(creepState: CreepState) {
    const usedCapacity = creepState.creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const maxCapacity = creepState.creep.store.getCapacity(RESOURCE_ENERGY);

    if (maxCapacity === null) {
        return;
    }

    if (creepState.memory.working && usedCapacity === 0) {
        // preemption since we need more enegy
        // TODO: deal with what happens if we start with 0 energy
        creepState.memory.taskId = undefined;
    }
}

export function moveTo(creepState: CreepState, target: RoomPosition | { pos: RoomPosition }) {
    creepState.creep.moveTo(target);
    creepState.moved = true;
}
